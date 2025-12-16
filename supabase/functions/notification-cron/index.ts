// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const EMAIL_WEBHOOK = Deno.env.get('NOTIFICATION_EMAIL_WEBHOOK');

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date;
}

async function findExistingNotification(
  audience: string,
  type: string,
  targetRole: string | null,
  meta: Record<string, any>,
) {
  let query = supabase
    .from('notifications')
    .select('id')
    .eq('audience', audience)
    .eq('type', type)
    .contains('meta', meta)
    .limit(1);
  query = targetRole ? query.eq('target_role', targetRole) : query.is('target_role', null);
  const { data } = await query.maybeSingle();
  return data;
}

async function createNotification(payload: Record<string, any>, meta: Record<string, any>) {
  const exists = await findExistingNotification(
    payload.audience,
    payload.type,
    payload.target_role ?? null,
    meta,
  );
  if (exists) return exists.id;
  const { data, error } = await supabase
    .from('notifications')
    .insert([{ ...payload, meta }])
    .select('id')
    .single();
  if (error) throw error;
  return data?.id;
}

async function generateLoanNotifications() {
  const today = new Date();
  const { data, error } = await supabase
    .from('loans')
    .select('id, borrower_name, borrower_member_number, borrower_contact, reserved_until')
    .eq('status', 'in_corso');
  if (error) throw error;
  for (const loan of data ?? []) {
    const dueDate = parseDate(loan.reserved_until);
    if (!dueDate || dueDate >= today) continue;
    const formatted = dueDate.toLocaleDateString('it-IT');
    await createNotification(
      {
        audience: 'admin',
        target_role: 'magazziniere',
        type: 'danger',
        title: 'Prestito materiale scaduto',
        message: `Il prestito assegnato a ${loan.borrower_name ?? 'socio'} sarebbe dovuto rientrare il ${formatted}.`,
        link: '/prestito-avanzato',
        due_date: dueDate.toISOString(),
      },
      {
        source_type: 'loan',
        source_id: loan.id,
        borrower_name: loan.borrower_name,
      },
    );
  }
}

async function generateLibraryNotifications() {
  const today = new Date();
  const { data, error } = await supabase
    .from('library_loans')
    .select('id, borrower_name, borrower_contact, loaned_at')
    .eq('status', 'active');
  if (error) throw error;
  for (const loan of data ?? []) {
    const loanedAt = parseDate(loan.loaned_at);
    if (!loanedAt) continue;
    const dueDate = new Date(loanedAt);
    dueDate.setDate(dueDate.getDate() + 30);
    if (dueDate >= today) continue;
    await createNotification(
      {
        audience: 'admin',
        target_role: 'admin',
        type: 'warning',
        title: 'Libro non restituito',
        message: `Il libro prestato a ${loan.borrower_name ?? 'socio'} non risulta restituito da oltre 30 giorni.`,
        link: '/biblioteca',
        due_date: dueDate.toISOString(),
      },
      {
        source_type: 'library_loan',
        source_id: loan.id,
        email: loan.borrower_contact,
      },
    );
  }
}

function resolveRecipients(notification: any) {
  const recipients: string[] = [];
  if (notification.audience === 'admin') {
    const role = notification.target_role ?? 'admin';
    const key = `NOTIFICATION_${role.toUpperCase()}_EMAIL`;
    const email = Deno.env.get(key);
    if (email) recipients.push(email);
  } else if (notification.audience === 'user') {
    const metaEmail = notification.meta?.email ?? notification.meta?.borrower_contact;
    if (metaEmail && metaEmail.includes('@')) recipients.push(metaEmail);
  }
  return recipients;
}

async function sendEmailNotification(notification: any, recipient: string) {
  if (!EMAIL_WEBHOOK) return false;
  const response = await fetch(EMAIL_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: recipient,
      subject: notification.title,
      message: notification.message,
      link: notification.link,
    }),
  });
  return response.ok;
}

async function deliverPendingEmails() {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .lte('due_date', now)
    .is('sent_email_at', null);
  if (error) throw error;
  for (const notification of data ?? []) {
    const recipients = resolveRecipients(notification);
    if (!recipients.length) continue;
    let sent = false;
    for (const recipient of recipients) {
      const ok = await sendEmailNotification(notification, recipient);
      if (ok) sent = true;
    }
    if (sent) {
      await supabase
        .from('notifications')
        .update({ sent_email_at: new Date().toISOString() })
        .eq('id', notification.id);
    }
  }
}

const cronSecret = Deno.env.get('NOTIFICATION_CRON_SECRET');

async function runCron() {
  await generateLoanNotifications();
  await generateLibraryNotifications();
  await deliverPendingEmails();
  return { success: true };
}

if (import.meta.main) {
  runCron()
    .then((result) => {
      console.log(JSON.stringify(result));
    })
    .catch((error) => {
      console.error('[notification-cron]', error.message ?? error);
      Deno.exit(1);
    });
}

export async function handleRequest(req: Request): Promise<Response> {
  const authHeader = req.headers.get('authorization');
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    const result = await runCron();
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[notification-cron]', error);
    return new Response(JSON.stringify({ error: error.message ?? String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
