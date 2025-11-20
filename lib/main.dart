import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:excel/excel.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:url_launcher/url_launcher.dart';

import 'data/soci.dart';
import 'utils/file_saver_stub.dart'
    if (dart.library.html) 'utils/file_saver_web.dart'
    as file_saver;

const Color kGSUPrimaryColor = Color(0xFF0F999C);
const Color kGSUAccentColor = Color(0xFFF26A5E);
const Color kGSUDarkTeal = Color(0xFF0A4F52);
const Color kGSUBackgroundColor = Color(0xFFF4FAFA);

final RegExp _digitsOnly = RegExp(r'^[0-9]+$');

Future<void> addAuditLog(
  String action, {
  String? socioId,
  String? nome,
  String? description,
  Map<String, dynamic>? extra,
}) async {
  final payload = {
    'action': action,
    'timestamp': FieldValue.serverTimestamp(),
    if (socioId != null) 'socioId': socioId,
    if (nome != null) 'nome': nome,
    if (description != null) 'description': description,
    if (extra != null && extra.isNotEmpty) 'extra': extra,
  };
  await FirebaseFirestore.instance.collection('audit_logs').add(payload);
}

bool _parseBool(dynamic value, {bool fallback = true}) {
  if (value is bool) return value;
  if (value is num) return value != 0;
  if (value is String) {
    final normalized = value.trim().toLowerCase();
    if (normalized.isEmpty) return fallback;
    if (normalized == 'true' ||
        normalized == '1' ||
        normalized == 'si' ||
        normalized == 'sì' ||
        normalized == 'yes' ||
        normalized == 'attivo') {
      return true;
    }
    if (normalized == 'false' ||
        normalized == '0' ||
        normalized == 'no' ||
        normalized == 'off' ||
        normalized == 'sospeso') {
      return false;
    }
  }
  return fallback;
}

Future<bool> ensureSocioActive(String tessera, String nome) async {
  final ref = FirebaseFirestore.instance.collection('soci_status').doc(tessera);
  final normalized = normalizeSocioKey(nome);
  final snap = await ref.get();
  if (!snap.exists) {
    bool attivo = true;
    final dupQuery = await FirebaseFirestore.instance
        .collection('soci_status')
        .where('nomeKey', isEqualTo: normalized)
        .limit(1)
        .get();
    if (dupQuery.docs.isNotEmpty) {
      final dupDoc = dupQuery.docs.first;
      if (dupDoc.id != tessera) {
        final dupData = dupDoc.data();
        attivo = _parseBool(dupData['attivo'], fallback: true);
        await dupDoc.reference.delete();
      }
    }
    await ref.set({
      'nome': nome,
      'nomeKey': normalized,
      'attivo': attivo,
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
    return attivo;
  }
  final data = snap.data();
  final attivo = _parseBool(data?['attivo'], fallback: true);
  if (!attivo) {
    return false;
  }
  final updates = <String, dynamic>{};
  if (data != null && data.containsKey('attivo') && data['attivo'] is! bool) {
    updates['attivo'] = attivo;
  }
  final storedNome = (data?['nome'] ?? '').toString();
  if (storedNome != nome) {
    updates['nome'] = nome;
  }
  final storedKey = (data?['nomeKey'] ?? '').toString();
  if (storedKey != normalized) {
    updates['nomeKey'] = normalized;
  }
  if (updates.isNotEmpty) {
    updates['updatedAt'] = FieldValue.serverTimestamp();
    await ref.update(updates);
  }
  return true;
}

Future<void> syncSociStatus() async {
  final batch = FirebaseFirestore.instance.batch();
  final ref = FirebaseFirestore.instance.collection('soci_status');
  for (final entry in sociByTessera.entries) {
    batch.set(ref.doc(entry.key), {
      'nome': entry.value,
      'nomeKey': normalizeSocioKey(entry.value),
      'attivo': true,
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }
  await batch.commit();
}

/// CONFIGURAZIONE FIREBASE  (i tuoi valori originali)
const FirebaseOptions firebaseOptions = FirebaseOptions(
  apiKey: 'AIzaSyC-4West7H4AMU9nQ3SKue1MAm-t8US3C4',
  authDomain: 'il-gsu.firebaseapp.com',
  projectId: 'il-gsu',
  storageBucket: 'il-gsu.appspot.com',
  messagingSenderId: '95470182636',
  appId: '1:95470182636:web:c6084ad7acb9e58bd4485c9',
);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: firebaseOptions);
  runApp(const SpeleoApp());
}

/// APP PRINCIPALE
class SpeleoApp extends StatelessWidget {
  const SpeleoApp({super.key});

  @override
  Widget build(BuildContext context) {
    final baseScheme = ColorScheme.fromSeed(
      seedColor: kGSUPrimaryColor,
      brightness: Brightness.light,
    );
    final scheme = baseScheme.copyWith(
      secondary: kGSUAccentColor,
      tertiary: kGSUDarkTeal,
      surface: Colors.white,
      background: kGSUBackgroundColor,
    );
    return MaterialApp(
      title: 'Inventario Speleo',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: scheme,
        scaffoldBackgroundColor: kGSUBackgroundColor,
        appBarTheme: AppBarTheme(
          backgroundColor: scheme.primary,
          foregroundColor: Colors.white,
          centerTitle: true,
          elevation: 0,
          titleTextStyle: const TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
            color: Colors.white,
          ),
        ),
        cardTheme: CardThemeData(
          color: Colors.white,
          elevation: 2,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
          margin: EdgeInsets.zero,
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 12,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: BorderSide(color: scheme.outlineVariant),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: BorderSide(color: scheme.outlineVariant),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: const BorderSide(color: kGSUAccentColor, width: 1.6),
          ),
        ),
        snackBarTheme: SnackBarThemeData(
          backgroundColor: kGSUDarkTeal,
          contentTextStyle: const TextStyle(color: Colors.white),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        bottomNavigationBarTheme: BottomNavigationBarThemeData(
          backgroundColor: Colors.white,
          selectedItemColor: scheme.primary,
          unselectedItemColor: scheme.onSurfaceVariant,
          showUnselectedLabels: true,
          type: BottomNavigationBarType.fixed,
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: scheme.primary,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14),
            textStyle: const TextStyle(fontWeight: FontWeight.w600),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
            ),
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: kGSUAccentColor,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14),
            textStyle: const TextStyle(fontWeight: FontWeight.w600),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
            ),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: scheme.primary,
            side: BorderSide(color: scheme.primary),
            padding: const EdgeInsets.symmetric(vertical: 14),
            textStyle: const TextStyle(fontWeight: FontWeight.w600),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
            ),
          ),
        ),
        chipTheme: ChipThemeData(
          backgroundColor: Colors.white,
          disabledColor: scheme.surfaceVariant,
          selectedColor: scheme.primary.withOpacity(0.12),
          secondarySelectedColor: scheme.primary,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          labelStyle: TextStyle(color: scheme.primary),
          secondaryLabelStyle: const TextStyle(color: Colors.white),
          brightness: Brightness.light,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          side: BorderSide(color: scheme.primary.withOpacity(0.4)),
        ),
        dividerColor: scheme.outlineVariant,
        textTheme: ThemeData.light().textTheme.apply(
              bodyColor: kGSUDarkTeal,
              displayColor: kGSUDarkTeal,
            ),
        useMaterial3: true,
      ),
      home: const MainScaffold(),
    );
  }
}

/// SCHEMA CON BOTTOM NAV BAR
class MainScaffold extends StatefulWidget {
  const MainScaffold({super.key});

  @override
  State<MainScaffold> createState() => _MainScaffoldState();
}

class _MainScaffoldState extends State<MainScaffold> {
  int _selectedIndex = 0;

  final List<Widget> _pages = const [
    HomePage(),
    InventoryPage(),
    UscitePage(),
    PrestitiPage(),
    AdminReportsPage(),
  ];

  void _onItemTapped(int index) {
    setState(() => _selectedIndex = index);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _pages[_selectedIndex],
      bottomNavigationBar: BottomNavigationBar(
        type: BottomNavigationBarType.fixed,
        currentIndex: _selectedIndex,
        onTap: _onItemTapped,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home), label: 'Home'),
          BottomNavigationBarItem(
            icon: Icon(Icons.inventory),
            label: 'Inventario',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.call_received),
            label: 'Uscite',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.swap_horiz),
            label: 'Prestiti',
          ),
          BottomNavigationBarItem(icon: Icon(Icons.file_copy), label: 'Report'),
        ],
      ),
    );
  }
}

/// =======================
///  HOME: ADMIN / SOCIO
/// =======================

enum UserRole { admin, socio }

class UserIdentity {
  final UserRole? role;
  final String? socioId;
  final String? displayName;

  const UserIdentity({this.role, this.socioId, this.displayName});

  bool get isAdmin => role == UserRole.admin;
  bool get isSocio => role == UserRole.socio;
}

final ValueNotifier<UserIdentity> userIdentityNotifier =
    ValueNotifier<UserIdentity>(const UserIdentity());

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  UserRole? _role;
  String? _socioId; // mail o numero tessera del socio

  static const _adminPin = '1999'; // PIN admin di esempio

  Future<void> _loginAsAdmin() async {
    final controller = TextEditingController();

    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('Accesso Admin'),
          content: TextField(
            controller: controller,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'PIN admin'),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Annulla'),
            ),
            TextButton(
              onPressed: () {
                Navigator.of(ctx).pop(controller.text.trim() == _adminPin);
              },
              child: const Text('Entra'),
            ),
          ],
        );
      },
    );

    if (!mounted) return;

    if (ok == true) {
      setState(() {
        _role = UserRole.admin;
        _socioId = null;
      });
      userIdentityNotifier.value = const UserIdentity(
        role: UserRole.admin,
        displayName: 'Admin',
      );
      await addAuditLog(
        'login_admin',
        nome: 'Admin',
        description: 'Accesso amministratore',
      );
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Accesso admin effettuato')));
    } else if (ok == false) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('PIN non valido')));
    }
  }

  Future<SocioInfo?> _resolveSocioRecord(String input) async {
    final record = findSocio(input);
    if (record != null) return record;
    final trimmed = input.trim();
    if (trimmed.isEmpty) return null;
    final sociRef = FirebaseFirestore.instance.collection('soci_status');
    if (_digitsOnly.hasMatch(trimmed)) {
      final doc = await sociRef.doc(trimmed).get();
      if (doc.exists) {
        final data = doc.data();
        final nome = (data?['nome'] ?? trimmed).toString();
        return SocioInfo(tessera: trimmed, nome: nome);
      }
    }
    final normalized = normalizeSocioKey(trimmed);
    if (normalized.isEmpty) return null;
    final query = await sociRef
        .where('nomeKey', isEqualTo: normalized)
        .limit(1)
        .get();
    if (query.docs.isNotEmpty) {
      final doc = query.docs.first;
      final data = doc.data();
      return SocioInfo(
        tessera: doc.id,
        nome: (data['nome'] ?? doc.id).toString(),
      );
    }
    return null;
  }

  Future<void> _loginAsSocio() async {
    final controller = TextEditingController();

    final String? value = await showDialog<String>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('Accesso Socio'),
          content: TextField(
            controller: controller,
            decoration: const InputDecoration(
              labelText: 'Nome o numero tessera',
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(null),
              child: const Text('Annulla'),
            ),
            TextButton(
              onPressed: () {
                Navigator.of(ctx).pop(controller.text.trim());
              },
              child: const Text('Entra'),
            ),
          ],
        );
      },
    );

    if (!mounted) return;

    if (value != null && value.isNotEmpty) {
      final record = await _resolveSocioRecord(value);
      if (record == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Socio non trovato. Controlla nome o numero tessera.',
              ),
            ),
          );
        }
        return;
      }
      final socioId = record.tessera;
      final nome = record.nome;
      final allowed = await ensureSocioActive(socioId, nome);
      if (!allowed) {
        await addAuditLog(
          'login_bloccato',
          socioId: socioId,
          nome: nome,
          description: 'Accesso negato (quota non in regola)',
        );
        if (!mounted) return;
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                '$nome (tessera $socioId) non è in regola con la quota.',
              ),
            ),
          );
          setState(() {
            _role = null;
            _socioId = null;
          });
          userIdentityNotifier.value = const UserIdentity();
        }
        return;
      }
      setState(() {
        _role = UserRole.socio;
        _socioId = socioId;
      });
      userIdentityNotifier.value = UserIdentity(
        role: UserRole.socio,
        socioId: socioId,
        displayName: nome,
      );
      await addAuditLog(
        'login_socio',
        socioId: socioId,
        nome: nome,
        description: 'Accesso socio',
        extra: {'input': value},
      );
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Benvenuto $nome (tessera $socioId)')),
      );
    } else if (value != null && value.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Inserisci un valore valido')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAdmin = _role == UserRole.admin;

    return Scaffold(
      appBar: AppBar(title: const Text('GSU')),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [kGSUBackgroundColor, Colors.white],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _buildLogo(),
                const SizedBox(height: 24),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 250),
                    child: Container(
                      key: ValueKey(_role ?? 'guest'),
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(28),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.08),
                            blurRadius: 32,
                            offset: const Offset(0, 18),
                          ),
                        ],
                      ),
                      child: _role == null
                          ? _buildAccessCard()
                          : _buildLoggedCard(isAdmin),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildAccessCard() {
    final theme = Theme.of(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Benvenuto nel gestionale GSU',
          textAlign: TextAlign.center,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Seleziona il tipo di accesso per continuare. Gli admin hanno pieno controllo, i soci possono operare sulle uscite.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _loginAsAdmin,
            child: const Text('Entra come Admin'),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: _loginAsSocio,
            child: const Text('Entra come Socio'),
          ),
        ),
      ],
    );
  }

  Widget _buildLoggedCard(bool isAdmin) {
    final theme = Theme.of(context);
    final displayName = userIdentityNotifier.value.displayName ?? 'Socio';
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          isAdmin ? 'Sei loggato come ADMIN' : 'Ciao $displayName',
          textAlign: TextAlign.center,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          isAdmin
              ? 'Hai accesso completo a inventario, uscite, prestiti e report.'
              : 'Puoi gestire inventario, uscite e prestiti assegnati.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        if (!isAdmin && _socioId != null) ...[
          const SizedBox(height: 16),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: kGSUBackgroundColor,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Text(
              'ID socio: $_socioId',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: kGSUDarkTeal,
              ),
            ),
          ),
        ],
        const SizedBox(height: 24),
        Text(
          'Le altre sezioni (Inventario, Uscite, Prestiti e Report) si gestiscono dal menu in basso.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyMedium,
        ),
        const SizedBox(height: 24),
        TextButton(
          onPressed: () {
            setState(() {
              _role = null;
              _socioId = null;
            });
            userIdentityNotifier.value = const UserIdentity();
          },
          child: const Text('Esci / cambia ruolo'),
        ),
      ],
    );
  }

  Widget _buildLogo() {
    return Container(
      width: 160,
      height: 160,
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: Colors.black26,
            blurRadius: 20,
            offset: Offset(0, 10),
          ),
        ],
      ),
      child: ClipOval(
        child: Image.asset(
          'assets/gsu_logo.png',
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => _buildFallbackLogo(),
        ),
      ),
    );
  }

  Widget _buildFallbackLogo() {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [Colors.deepPurple.shade400, Colors.deepPurple.shade200],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      alignment: Alignment.center,
      child: const Text(
        'GSU',
        style: TextStyle(
          color: Colors.white,
          fontSize: 42,
          fontWeight: FontWeight.bold,
          letterSpacing: 2,
        ),
      ),
    );
  }
}

/// =======================
///  INVENTARIO
/// =======================

class InventoryPage extends StatefulWidget {
  const InventoryPage({super.key});

  @override
  State<InventoryPage> createState() => _InventoryPageState();
}

class _InventoryPageState extends State<InventoryPage> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<UserIdentity>(
      valueListenable: userIdentityNotifier,
      builder: (context, identity, _) {
        return Scaffold(
          appBar: AppBar(title: const Text('Inventario Materiali')),
          floatingActionButton: identity.isAdmin
              ? FloatingActionButton.extended(
                  onPressed: () => _openItemSheet(),
                  icon: const Icon(Icons.add),
                  label: const Text('Nuovo materiale'),
                )
              : null,
          body: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: TextField(
                  controller: _searchController,
                  decoration: const InputDecoration(
                    prefixIcon: Icon(Icons.search),
                    labelText: 'Cerca per nome o descrizione',
                    border: OutlineInputBorder(),
                  ),
                  onChanged: (_) => setState(() {}),
                ),
              ),
              Expanded(
                child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                  stream: FirebaseFirestore.instance
                      .collection('items')
                      .orderBy('nome')
                      .snapshots(),
                  builder: (context, snapshot) {
                    if (snapshot.hasError) {
                      return Center(
                        child: Text(
                          'Errore nel caricamento: ${snapshot.error}',
                        ),
                      );
                    }

                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const Center(child: CircularProgressIndicator());
                    }

                    final docs = snapshot.data?.docs ?? [];
                    final search = _searchController.text.toLowerCase().trim();
                    final filtered = search.isEmpty
                        ? docs
                        : docs.where((doc) {
                            final data = doc.data();
                            final nome = (data['nome'] ?? '')
                                .toString()
                                .toLowerCase();
                            final descrizione = (data['descrizione'] ?? '')
                                .toString()
                                .toLowerCase();
                            return nome.contains(search) ||
                                descrizione.contains(search);
                          }).toList();

                    if (filtered.isEmpty) {
                      return const Center(
                        child: Text(
                          'Nessun materiale corrisponde alla ricerca',
                        ),
                      );
                    }

                    return ListView.builder(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 4,
                      ),
                      itemCount: filtered.length,
                      itemBuilder: (context, index) {
                        final doc = filtered[index];
                        final data = doc.data();
                        final nome = (data['nome'] ?? 'Senza nome') as String;
                        final descrizione =
                            (data['descrizione'] ?? '') as String;
                        final disp = (data['qty_disponibile'] ?? 0) as int;
                        final tot = (data['qty_totale'] ?? disp) as int;
                        final prenotata = (data['qty_prenotata'] ?? 0) as int;

                        return Card(
                          margin: const EdgeInsets.symmetric(
                            horizontal: 4,
                            vertical: 6,
                          ),
                          child: ListTile(
                            title: Text(nome),
                            subtitle: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if (descrizione.isNotEmpty) Text(descrizione),
                                Text('Disponibile: $disp / $tot'),
                                if (prenotata > 0)
                                  Text(
                                    'Prenotata: $prenotata',
                                    style: TextStyle(color: Colors.orange[700]),
                                  ),
                              ],
                            ),
                            trailing: identity.isAdmin
                                ? PopupMenuButton<String>(
                                    onSelected: (value) {
                                      if (value == 'edit') {
                                        _openItemSheet(existingDoc: doc);
                                      } else if (value == 'purchase') {
                                        _registerPurchase(doc);
                                      } else if (value == 'delete') {
                                        _deleteItem(doc);
                                      }
                                    },
                                    itemBuilder: (context) => [
                                      const PopupMenuItem(
                                        value: 'edit',
                                        child: ListTile(
                                          leading: Icon(Icons.edit),
                                          title: Text('Modifica'),
                                        ),
                                      ),
                                      const PopupMenuItem(
                                        value: 'purchase',
                                        child: ListTile(
                                          leading: Icon(
                                            Icons.add_shopping_cart,
                                          ),
                                          title: Text('Registra acquisto'),
                                        ),
                                      ),
                                      const PopupMenuItem(
                                        value: 'delete',
                                        child: ListTile(
                                          leading: Icon(Icons.delete_outline),
                                          title: Text('Elimina'),
                                        ),
                                      ),
                                    ],
                                  )
                                : Text(
                                    '$disp / $tot',
                                    style: Theme.of(
                                      context,
                                    ).textTheme.titleMedium,
                                  ),
                          ),
                        );
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _openItemSheet({
    QueryDocumentSnapshot<Map<String, dynamic>>? existingDoc,
  }) async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) {
        return Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(context).viewInsets.bottom,
          ),
          child: InventoryItemSheet(existingDoc: existingDoc),
        );
      },
    );
    if (result == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            existingDoc == null ? 'Materiale creato' : 'Materiale aggiornato',
          ),
        ),
      );
    }
  }

  Future<void> _deleteItem(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
  ) async {
    final conferma =
        await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Elimina materiale'),
            content: Text('Vuoi eliminare "${doc.data()['nome'] ?? doc.id}"?'),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: const Text('Annulla'),
              ),
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(true),
                child: const Text('Elimina'),
              ),
            ],
          ),
        ) ??
        false;
    if (!conferma) return;

    try {
      await doc.reference.delete();
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Materiale eliminato')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Errore eliminazione: $e')));
      }
    }
  }

  Future<void> _registerPurchase(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
  ) async {
    final controller = TextEditingController();
    final conferma = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Registra nuovo acquisto'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(
            labelText: 'Quantità da aggiungere',
          ),
          keyboardType: TextInputType.number,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Annulla'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Aggiungi'),
          ),
        ],
      ),
    );

    if (conferma != true) return;
    final qty = int.tryParse(controller.text.trim());
    if (qty == null || qty <= 0) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Quantità non valida')));
      return;
    }

    try {
      await FirebaseFirestore.instance.runTransaction((transaction) async {
        final snap = await transaction.get(doc.reference);
        if (!snap.exists) return;
        final data = snap.data() as Map<String, dynamic>;
        final disponibile = (data['qty_disponibile'] ?? 0) as int;
        final totale = (data['qty_totale'] ?? disponibile) as int;
        transaction.update(doc.reference, {
          'qty_disponibile': disponibile + qty,
          'qty_totale': totale + qty,
          'ultimoAcquisto': FieldValue.serverTimestamp(),
        });
      });
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Quantità aggiornata')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Errore aggiornamento: $e')));
      }
    }
  }
}

class InventoryItemSheet extends StatefulWidget {
  const InventoryItemSheet({super.key, this.existingDoc});

  final QueryDocumentSnapshot<Map<String, dynamic>>? existingDoc;

  @override
  State<InventoryItemSheet> createState() => _InventoryItemSheetState();
}

class _InventoryItemSheetState extends State<InventoryItemSheet> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _nomeController = TextEditingController();
  final TextEditingController _descrizioneController = TextEditingController();
  final TextEditingController _totaleController = TextEditingController();
  final TextEditingController _disponibileController = TextEditingController();
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final data = widget.existingDoc?.data();
    if (data != null) {
      _nomeController.text = (data['nome'] ?? '').toString();
      _descrizioneController.text = (data['descrizione'] ?? '').toString();
      _totaleController.text = '${data['qty_totale'] ?? 0}';
      _disponibileController.text = '${data['qty_disponibile'] ?? 0}';
    }
  }

  @override
  void dispose() {
    _nomeController.dispose();
    _descrizioneController.dispose();
    _totaleController.dispose();
    _disponibileController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isEditing = widget.existingDoc != null;
    return Padding(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 24,
        bottom: 24 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                isEditing ? 'Modifica materiale' : 'Nuovo materiale',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _nomeController,
                decoration: const InputDecoration(
                  labelText: 'Nome',
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Inserisci il nome';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _descrizioneController,
                decoration: const InputDecoration(
                  labelText: 'Descrizione',
                  border: OutlineInputBorder(),
                ),
                maxLines: 2,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _totaleController,
                decoration: const InputDecoration(
                  labelText: 'Quantità totale',
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.number,
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Inserisci la quantità totale';
                  }
                  final parsed = int.tryParse(value);
                  if (parsed == null || parsed < 0) {
                    return 'Valore non valido';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _disponibileController,
                decoration: const InputDecoration(
                  labelText: 'Quantità disponibile',
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.number,
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Inserisci la quantità disponibile';
                  }
                  final parsed = int.tryParse(value);
                  if (parsed == null || parsed < 0) {
                    return 'Valore non valido';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  icon: _saving
                      ? const SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.save),
                  label: Text(_saving ? 'Salvataggio...' : 'Salva'),
                  onPressed: _saving ? null : _salva,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _salva() async {
    if (!_formKey.currentState!.validate()) return;
    final totale = int.parse(_totaleController.text.trim());
    final disponibile = int.parse(_disponibileController.text.trim());
    if (disponibile > totale) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('La quantità disponibile non può superare il totale'),
        ),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      if (widget.existingDoc == null) {
        await FirebaseFirestore.instance.collection('items').add({
          'nome': _nomeController.text.trim(),
          'descrizione': _descrizioneController.text.trim(),
          'qty_totale': totale,
          'qty_disponibile': disponibile,
          'qty_prenotata': 0,
          'createdAt': FieldValue.serverTimestamp(),
        });
      } else {
        final prenotata =
            (widget.existingDoc!.data()['qty_prenotata'] ?? 0) as int;
        if (disponibile < prenotata) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'Ci sono $prenotata pezzi prenotati: quantità disponibile minima $prenotata',
              ),
            ),
          );
          setState(() => _saving = false);
          return;
        }
        await widget.existingDoc!.reference.update({
          'nome': _nomeController.text.trim(),
          'descrizione': _descrizioneController.text.trim(),
          'qty_totale': totale,
          'qty_disponibile': disponibile,
          'aggiornatoIl': FieldValue.serverTimestamp(),
        });
      }
      if (mounted) {
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      setState(() => _saving = false);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Errore salvataggio: $e')));
    }
  }
}

/// =======================
///  USCITE
/// =======================

enum UscitaStatusFilter { tutte, aperte, chiuse }

enum UscitaTimeFilter { tutte, future, passate }

String _formatDateLabel(DateTime? date, {bool includeTime = false}) {
  if (date == null) return '';
  final dd = date.day.toString().padLeft(2, '0');
  final mm = date.month.toString().padLeft(2, '0');
  final yyyy = date.year.toString();
  final base = '$dd/$mm/$yyyy';
  if (!includeTime) return base;
  final hh = date.hour.toString().padLeft(2, '0');
  final min = date.minute.toString().padLeft(2, '0');
  return '$base $hh:$min';
}

String _formatTimestampLabel(Timestamp? ts, {bool includeTime = false}) {
  return _formatDateLabel(ts?.toDate(), includeTime: includeTime);
}

int _toInt(Object? value, {int defaultValue = 0}) {
  if (value == null) return defaultValue;
  if (value is int) return value;
  if (value is double) return value.round();
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value) ?? defaultValue;
  return defaultValue;
}

class UscitePage extends StatefulWidget {
  const UscitePage({super.key});

  @override
  State<UscitePage> createState() => _UscitePageState();
}

class _UscitePageState extends State<UscitePage> {
  final TextEditingController _searchController = TextEditingController();
  UscitaStatusFilter _statusFilter = UscitaStatusFilter.tutte;
  UscitaTimeFilter _timeFilter = UscitaTimeFilter.tutte;
  bool _creatingUscita = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<UserIdentity>(
      valueListenable: userIdentityNotifier,
      builder: (context, identity, _) {
        final canCreate = identity.role != null;
        return Scaffold(
          appBar: AppBar(
            title: const Text('Uscite'),
            actions: [
              if (canCreate)
                IconButton(
                  icon: const Icon(Icons.add),
                  tooltip: 'Nuova uscita',
                  onPressed: _creatingUscita
                      ? null
                      : () => _showCreateUscitaSheet(identity),
                ),
            ],
          ),
          floatingActionButton: canCreate
              ? FloatingActionButton.extended(
                  onPressed: _creatingUscita
                      ? null
                      : () => _showCreateUscitaSheet(identity),
                  icon: const Icon(Icons.add),
                  label: const Text('Nuova uscita'),
                )
              : null,
          body: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: TextField(
                  controller: _searchController,
                  decoration: const InputDecoration(
                    labelText: 'Cerca per luogo, responsabile o tipo',
                    prefixIcon: Icon(Icons.search),
                    border: OutlineInputBorder(),
                  ),
                  onChanged: (_) => setState(() {}),
                ),
              ),
              _buildFilters(),
              Expanded(
                child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                  stream: FirebaseFirestore.instance
                      .collection('uscite')
                      .orderBy('dataInizio')
                      .snapshots(),
                  builder: (context, snapshot) {
                    if (snapshot.hasError) {
                      return Center(
                        child: Text(
                          'Errore nel caricamento: ${snapshot.error}',
                        ),
                      );
                    }

                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const Center(child: CircularProgressIndicator());
                    }

                    final docs = snapshot.data?.docs ?? [];
                    final now = DateTime.now();
                    final today = DateTime(now.year, now.month, now.day);

                    final filtered = docs.where((doc) {
                      final data = doc.data();
                      final stato = (data['stato'] ?? 'aperta') as String;
                      final ts = data['dataInizio'] as Timestamp?;
                      final date = ts?.toDate();
                      final search = _searchController.text
                          .toLowerCase()
                          .trim();

                      if (_statusFilter == UscitaStatusFilter.aperte &&
                          stato != 'aperta') {
                        return false;
                      }
                      if (_statusFilter == UscitaStatusFilter.chiuse &&
                          stato != 'chiusa') {
                        return false;
                      }

                      if (_timeFilter != UscitaTimeFilter.tutte) {
                        if (date == null) return false;
                        final dateOnly = DateTime(
                          date.year,
                          date.month,
                          date.day,
                        );
                        final isFuture =
                            dateOnly.isAfter(today) ||
                            dateOnly.isAtSameMomentAs(today);
                        final isPast = dateOnly.isBefore(today);
                        if (_timeFilter == UscitaTimeFilter.future &&
                            !isFuture) {
                          return false;
                        }
                        if (_timeFilter == UscitaTimeFilter.passate &&
                            !isPast) {
                          return false;
                        }
                      }

                      if (search.isNotEmpty) {
                        final luogo = (data['luogo'] ?? '') as String;
                        final tipo = (data['tipo'] ?? '') as String;
                        final responsabile =
                            (data['responsabile'] ?? '') as String;
                        final testo = ('$luogo $tipo $responsabile')
                            .toLowerCase();
                        if (!testo.contains(search)) return false;
                      }

                      return true;
                    }).toList();

                    if (filtered.isEmpty) {
                      return const Center(
                        child: Text('Nessuna uscita corrisponde ai filtri.'),
                      );
                    }

                    return ListView.builder(
                      padding: const EdgeInsets.all(12),
                      itemCount: filtered.length,
                      itemBuilder: (context, index) {
                        final doc = filtered[index];
                        final data = doc.data();
                        final ts = data['dataInizio'] as Timestamp?;
                        final stato = (data['stato'] ?? 'aperta') as String;
                        final tipo = (data['tipo'] ?? '') as String;
                        final luogo = (data['luogo'] ?? '') as String;
                        final titolo = (data['titolo'] ?? 'Uscita') as String;
                        final participants =
                            (data['partecipantiCount'] ?? 0) as int;
                        final materiali = (data['materialiCount'] ?? 0) as int;
                        final createdById =
                            (data['createdById'] ?? '') as String;
                        final canManage =
                            identity.isAdmin ||
                            (identity.socioId != null &&
                                identity.socioId == createdById);

                        return Card(
                          margin: const EdgeInsets.symmetric(
                            horizontal: 4,
                            vertical: 6,
                          ),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(12),
                            onTap: () {
                              Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => UscitaDetailPage(
                                    uscitaRef: doc.reference,
                                  ),
                                ),
                              );
                            },
                            onLongPress: canManage
                                ? () => _showUscitaActions(
                                    context,
                                    identity,
                                    doc,
                                    data,
                                    stato,
                                  )
                                : null,
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.center,
                                    children: [
                                      Expanded(
                                        child: Text(
                                          titolo,
                                          style: Theme.of(
                                            context,
                                          ).textTheme.titleMedium,
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Chip(
                                        label: Text(stato.toUpperCase()),
                                        backgroundColor: stato == 'chiusa'
                                            ? Colors.green[100]
                                            : Colors.orange[100],
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    luogo,
                                    style: Theme.of(
                                      context,
                                    ).textTheme.bodyMedium,
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '${_formatTimestampLabel(ts, includeTime: true)}  •  $tipo',
                                    style: Theme.of(
                                      context,
                                    ).textTheme.bodySmall,
                                  ),
                                  const SizedBox(height: 12),
                                  Wrap(
                                    spacing: 12,
                                    runSpacing: 4,
                                    children: [
                                      Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          const Icon(Icons.group, size: 18),
                                          const SizedBox(width: 4),
                                          Text('$participants partecipanti'),
                                        ],
                                      ),
                                      Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          const Icon(
                                            Icons.inventory_2,
                                            size: 18,
                                          ),
                                          const SizedBox(width: 4),
                                          Text('$materiali materiali'),
                                        ],
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildFilters() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            children: [
              FilterChip(
                label: const Text('Tutte'),
                selected: _statusFilter == UscitaStatusFilter.tutte,
                onSelected: (_) {
                  setState(() {
                    _statusFilter = UscitaStatusFilter.tutte;
                  });
                },
              ),
              FilterChip(
                label: const Text('Aperte'),
                selected: _statusFilter == UscitaStatusFilter.aperte,
                onSelected: (_) {
                  setState(() {
                    _statusFilter = UscitaStatusFilter.aperte;
                  });
                },
              ),
              FilterChip(
                label: const Text('Chiuse'),
                selected: _statusFilter == UscitaStatusFilter.chiuse,
                onSelected: (_) {
                  setState(() {
                    _statusFilter = UscitaStatusFilter.chiuse;
                  });
                },
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              ChoiceChip(
                label: const Text('Tutte le date'),
                selected: _timeFilter == UscitaTimeFilter.tutte,
                onSelected: (_) {
                  setState(() {
                    _timeFilter = UscitaTimeFilter.tutte;
                  });
                },
              ),
              ChoiceChip(
                label: const Text('Future'),
                selected: _timeFilter == UscitaTimeFilter.future,
                onSelected: (_) {
                  setState(() {
                    _timeFilter = UscitaTimeFilter.future;
                  });
                },
              ),
              ChoiceChip(
                label: const Text('Passate'),
                selected: _timeFilter == UscitaTimeFilter.passate,
                onSelected: (_) {
                  setState(() {
                    _timeFilter = UscitaTimeFilter.passate;
                  });
                },
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _showCreateUscitaSheet(
    UserIdentity identity, {
    DocumentSnapshot<Map<String, dynamic>>? existingDoc,
  }) async {
    setState(() => _creatingUscita = true);
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) {
        return Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(context).viewInsets.bottom,
          ),
          child: CreateUscitaSheet(
            identity: identity,
            existingDoc: existingDoc,
          ),
        );
      },
    );
    if (!mounted) return;
    setState(() => _creatingUscita = false);
    if (created == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            existingDoc == null
                ? 'Uscita creata con successo'
                : 'Uscita aggiornata',
          ),
        ),
      );
    }
  }

  Future<void> _showUscitaActions(
    BuildContext context,
    UserIdentity identity,
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
    Map<String, dynamic> data,
    String stato,
  ) async {
    final createdById = (data['createdById'] ?? '') as String;
    final canManage =
        identity.isAdmin ||
        (identity.socioId != null && identity.socioId == createdById);
    final action = await showModalBottomSheet<String>(
      context: context,
      builder: (context) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.edit),
                title: const Text('Modifica uscita'),
                onTap: () => Navigator.of(context).pop('edit'),
              ),
              if (stato != 'chiusa' && canManage)
                ListTile(
                  leading: const Icon(Icons.flag),
                  title: const Text('Chiudi uscita'),
                  onTap: () => Navigator.of(context).pop('close'),
                ),
              if (identity.isAdmin)
                ListTile(
                  leading: const Icon(Icons.delete_outline, color: Colors.red),
                  title: const Text('Elimina uscita'),
                  onTap: () => Navigator.of(context).pop('delete'),
                ),
            ],
          ),
        );
      },
    );

    if (!mounted || action == null) return;
    if (action == 'edit') {
      await _showCreateUscitaSheet(identity, existingDoc: doc);
    } else if (action == 'close' && canManage) {
      final success = await _closeUscita(doc.reference);
      if (success) {
        await addAuditLog(
          'uscita_chiusa',
          socioId: identity.socioId,
          nome: identity.displayName,
          description: 'Chiusura uscita ${doc.id}',
        );
      }
    } else if (action == 'delete' && identity.isAdmin) {
      final success = await _deleteUscita(doc.reference);
      if (success) {
        await addAuditLog(
          'uscita_eliminata',
          socioId: identity.socioId,
          nome: identity.displayName,
          description: 'Eliminazione uscita ${doc.id}',
        );
      }
    }
  }

  Future<bool> _closeUscita(DocumentReference<Map<String, dynamic>> ref) async {
    final commentController = TextEditingController();
    final comment = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Chiudi uscita'),
        content: TextField(
          controller: commentController,
          decoration: const InputDecoration(labelText: 'Commento (opzionale)'),
          maxLines: 3,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(null),
            child: const Text('Annulla'),
          ),
          TextButton(
            onPressed: () =>
                Navigator.of(ctx).pop(commentController.text.trim()),
            child: const Text('Chiudi'),
          ),
        ],
      ),
    );
    if (comment == null) return false;

    try {
      await FirebaseFirestore.instance.runTransaction((transaction) async {
        final snap = await transaction.get(ref);
        if (!snap.exists) {
          throw Exception('Uscita non trovata');
        }
        transaction.update(ref, {
          'stato': 'chiusa',
          'dataChiusura': FieldValue.serverTimestamp(),
          'commento': comment,
        });
      });
      await releaseMaterialiForUscita(ref);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Uscita chiusa e materiali rilasciati')),
        );
      }
      return true;
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Errore nella chiusura: $e')));
      }
      return false;
    }
  }

  Future<bool> _deleteUscita(
    DocumentReference<Map<String, dynamic>> ref,
  ) async {
    final conferma = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Elimina uscita'),
        content: const Text(
          'Questa operazione eliminerà uscita, partecipanti e materiali. Continuare?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Annulla'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Elimina'),
          ),
        ],
      ),
    );

    if (conferma != true) return false;

    try {
      await releaseMaterialiForUscita(ref);
      final partecipanti = await ref.collection('partecipanti').get();
      for (final doc in partecipanti.docs) {
        await doc.reference.delete();
      }
      await ref.delete();
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Uscita eliminata')));
      }
      return true;
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Errore eliminazione: $e')));
      }
      return false;
    }
  }
}

class CreateUscitaSheet extends StatefulWidget {
  const CreateUscitaSheet({
    super.key,
    required this.identity,
    this.existingDoc,
  });

  final UserIdentity identity;
  final DocumentSnapshot<Map<String, dynamic>>? existingDoc;

  bool get isEditing => existingDoc != null;

  @override
  State<CreateUscitaSheet> createState() => _CreateUscitaSheetState();
}

class _CreateUscitaSheetState extends State<CreateUscitaSheet> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _titoloController = TextEditingController();
  final TextEditingController _luogoController = TextEditingController();
  final TextEditingController _responsabileController = TextEditingController();
  final TextEditingController _tipoController = TextEditingController();
  final TextEditingController _noteController = TextEditingController();

  DateTime? _dataInizio;
  bool _salvando = false;

  @override
  void initState() {
    super.initState();
    if (widget.existingDoc != null) {
      final data = widget.existingDoc!.data();
      _titoloController.text = (data?['titolo'] ?? '').toString();
      _luogoController.text = (data?['luogo'] ?? '').toString();
      _responsabileController.text =
          (data?['responsabile'] ?? widget.identity.displayName ?? '')
              .toString();
      _tipoController.text = (data?['tipo'] ?? '').toString();
      _noteController.text = (data?['note'] ?? '').toString();
      final ts = data?['dataInizio'] as Timestamp?;
      _dataInizio = ts?.toDate();
    } else {
      _responsabileController.text =
          widget.identity.displayName ?? 'Responsabile';
    }
  }

  @override
  void dispose() {
    _titoloController.dispose();
    _luogoController.dispose();
    _responsabileController.dispose();
    _tipoController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 24,
        bottom: 24 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                widget.existingDoc == null ? 'Nuova uscita' : 'Modifica uscita',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _titoloController,
                decoration: const InputDecoration(
                  labelText: 'Titolo',
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Inserisci un titolo';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _luogoController,
                decoration: const InputDecoration(
                  labelText: 'Luogo',
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Inserisci il luogo';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: InkWell(
                      onTap: _salvando ? null : _pickDate,
                      child: InputDecorator(
                        decoration: const InputDecoration(
                          labelText: 'Data e ora',
                          border: OutlineInputBorder(),
                        ),
                        child: Text(
                          _dataInizio != null
                              ? _formatDateLabel(_dataInizio, includeTime: true)
                              : 'Seleziona data',
                        ),
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.today),
                    onPressed: _salvando ? null : _pickDate,
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _responsabileController,
                decoration: const InputDecoration(
                  labelText: 'Responsabile',
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Indica un responsabile';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _tipoController,
                decoration: const InputDecoration(
                  labelText: 'Tipo (es. addestramento, uscita tecnica)',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _noteController,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Note',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  icon: _salvando
                      ? const SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.save),
                  label: Text(
                    _salvando
                        ? 'Salvataggio...'
                        : widget.isEditing
                        ? 'Salva modifiche'
                        : 'Crea uscita',
                  ),
                  onPressed: _salvando ? null : _salva,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final selectedDate = await showDatePicker(
      context: context,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 5),
      initialDate: _dataInizio ?? now,
    );
    if (selectedDate == null) return;
    final selectedTime = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_dataInizio ?? now),
      builder: (ctx, child) {
        return MediaQuery(
          data: MediaQuery.of(ctx!).copyWith(alwaysUse24HourFormat: true),
          child: child ?? const SizedBox.shrink(),
        );
      },
    );
    if (selectedTime == null) return;
    setState(() {
      _dataInizio = DateTime(
        selectedDate.year,
        selectedDate.month,
        selectedDate.day,
        selectedTime.hour,
        selectedTime.minute,
      );
    });
  }

  Future<void> _salva() async {
    if (!_formKey.currentState!.validate()) return;
    if (_dataInizio == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Seleziona una data')));
      return;
    }

    setState(() => _salvando = true);
    try {
      final dataToSave = {
        'titolo': _titoloController.text.trim(),
        'luogo': _luogoController.text.trim(),
        'responsabile': _responsabileController.text.trim(),
        'tipo': _tipoController.text.trim(),
        'note': _noteController.text.trim(),
        'dataInizio': Timestamp.fromDate(_dataInizio!),
      };
      if (widget.existingDoc == null) {
        final result = await FirebaseFirestore.instance
            .collection('uscite')
            .add({
              ...dataToSave,
              'stato': 'aperta',
              'materialiCount': 0,
              'partecipantiCount': 0,
              'createdAt': FieldValue.serverTimestamp(),
              'createdById': widget.identity.socioId ?? 'admin',
              'createdByName': widget.identity.displayName ?? 'Admin',
            });
        await addAuditLog(
          'uscita_creata',
          socioId: widget.identity.socioId,
          nome: widget.identity.displayName,
          description: 'Creazione uscita ${result.id}',
        );
      } else {
        await widget.existingDoc!.reference.update({
          ...dataToSave,
          'aggiornatoIl': FieldValue.serverTimestamp(),
        });
        await addAuditLog(
          'uscita_modificata',
          socioId: widget.identity.socioId,
          nome: widget.identity.displayName,
          description: 'Modifica uscita ${widget.existingDoc!.id}',
        );
      }
      if (mounted) {
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      setState(() => _salvando = false);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Errore nel salvataggio: $e')));
    }
  }
}

class UscitaDetailPage extends StatefulWidget {
  const UscitaDetailPage({super.key, required this.uscitaRef});

  final DocumentReference<Map<String, dynamic>> uscitaRef;

  @override
  State<UscitaDetailPage> createState() => _UscitaDetailPageState();
}

class _UscitaDetailPageState extends State<UscitaDetailPage> {
  bool _closing = false;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<UserIdentity>(
      valueListenable: userIdentityNotifier,
      builder: (context, identity, _) {
        return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
          stream: widget.uscitaRef.snapshots(),
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return Scaffold(
                appBar: AppBar(),
                body: Center(child: Text('Errore: ${snapshot.error}')),
              );
            }

            if (!snapshot.hasData || !snapshot.data!.exists) {
              return const Scaffold(
                body: Center(child: CircularProgressIndicator()),
              );
            }

            final data = snapshot.data!.data()!;
            final titolo = (data['titolo'] ?? 'Dettagli uscita') as String;
            final stato = (data['stato'] ?? 'aperta') as String;
            final isChiusa = stato == 'chiusa';
            final Timestamp? dataInizio = data['dataInizio'] as Timestamp?;
            final Timestamp? dataChiusura = data['dataChiusura'] as Timestamp?;
            final createdById = (data['createdById'] ?? '') as String;
            final canManage =
                identity.isAdmin ||
                (identity.socioId != null && identity.socioId == createdById);

            return Scaffold(
              appBar: AppBar(
                title: Text(titolo),
                actions: [
                  if (canManage)
                    IconButton(
                      icon: const Icon(Icons.edit),
                      tooltip: 'Modifica uscita',
                      onPressed: () => _openEditSheet(identity, snapshot.data!),
                    ),
                  if (canManage && !isChiusa)
                    IconButton(
                      icon: _closing
                          ? const CircularProgressIndicator()
                          : const Icon(Icons.flag_circle),
                      tooltip: 'Chiudi uscita',
                      onPressed: _closing
                          ? null
                          : () => _closeFromDetail(context, identity),
                    ),
                ],
              ),
              body: LayoutBuilder(
                builder: (context, constraints) {
                  final detailsCard = Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Informazioni generali',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 12),
                          _DetailRow(
                            icon: Icons.location_on,
                            label: 'Luogo',
                            value: (data['luogo'] ?? '-') as String,
                            onTap:
                                (data['luogo'] ?? '')
                                    .toString()
                                    .trim()
                                    .isNotEmpty
                                ? () =>
                                      _openMaps((data['luogo'] ?? '') as String)
                                : null,
                          ),
                          _DetailRow(
                            icon: Icons.today,
                            label: 'Data',
                            value: _formatTimestampLabel(
                              dataInizio,
                              includeTime: true,
                            ),
                          ),
                          _DetailRow(
                            icon: Icons.person,
                            label: 'Responsabile',
                            value:
                                (data['responsabile'] ?? 'Non indicato')
                                    as String,
                          ),
                          _DetailRow(
                            icon: Icons.category,
                            label: 'Tipo',
                            value: (data['tipo'] ?? '-') as String,
                          ),
                          _DetailRow(
                            icon: Icons.info,
                            label: 'Stato',
                            value: stato,
                          ),
                          if (isChiusa)
                            _DetailRow(
                              icon: Icons.lock_clock,
                              label: 'Chiusa il',
                              value: _formatTimestampLabel(
                                dataChiusura,
                                includeTime: true,
                              ),
                            ),
                          if ((data['note'] ?? '').toString().isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 12),
                              child: Text(
                                'Note:\n${data['note']}',
                                style: Theme.of(context).textTheme.bodyMedium,
                              ),
                            ),
                          if ((data['commento'] ?? '')
                              .toString()
                              .trim()
                              .isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 12),
                              child: Text(
                                'Commento finale:\n${data['commento']}',
                                style: Theme.of(context).textTheme.bodyMedium,
                              ),
                            ),
                        ],
                      ),
                    ),
                  );

                  final materialiSection = MaterialiCollegatiSection(
                    uscitaRef: widget.uscitaRef,
                    identity: identity,
                    isChiusa: isChiusa,
                    uscitaTitle: titolo,
                  );

                  final fotoSection = FotoSection(
                    uscitaRef: widget.uscitaRef,
                    identity: identity,
                  );

                  final commentiSection = CommentiSection(
                    uscitaRef: widget.uscitaRef,
                    identity: identity,
                  );

                  final partecipantiSection = PartecipantiSection(
                    uscitaRef: widget.uscitaRef,
                    identity: identity,
                    isChiusa: isChiusa,
                  );

                  if (constraints.maxWidth > 900) {
                    return Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: ListView(
                              children: [
                                detailsCard,
                                const SizedBox(height: 16),
                                materialiSection,
                                const SizedBox(height: 16),
                                fotoSection,
                              ],
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: ListView(
                              children: [
                                commentiSection,
                                const SizedBox(height: 16),
                                partecipantiSection,
                              ],
                            ),
                          ),
                        ],
                      ),
                    );
                  }

                  return ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      detailsCard,
                      const SizedBox(height: 16),
                      materialiSection,
                      const SizedBox(height: 16),
                      fotoSection,
                      const SizedBox(height: 16),
                      commentiSection,
                      const SizedBox(height: 16),
                      partecipantiSection,
                    ],
                  );
                },
              ),
            );
          },
        );
      },
    );
  }

  Future<void> _closeFromDetail(
    BuildContext context,
    UserIdentity identity,
  ) async {
    setState(() => _closing = true);
    try {
      await FirebaseFirestore.instance.runTransaction((transaction) async {
        final snap = await transaction.get(widget.uscitaRef);
        if (!snap.exists) {
          throw Exception('Uscita non trovata');
        }
        transaction.update(widget.uscitaRef, {
          'stato': 'chiusa',
          'dataChiusura': FieldValue.serverTimestamp(),
        });
      });
      await releaseMaterialiForUscita(widget.uscitaRef);
      await addAuditLog(
        'uscita_chiusa',
        socioId: identity.socioId,
        nome: identity.displayName,
        description: 'Chiusura uscita ${widget.uscitaRef.id}',
      );
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Uscita chiusa')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Errore: $e')));
      }
    } finally {
      if (mounted) {
        setState(() => _closing = false);
      }
    }
  }

  Future<void> _openEditSheet(
    UserIdentity identity,
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) async {
    final updated = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: CreateUscitaSheet(identity: identity, existingDoc: doc),
      ),
    );
    if (updated == true && mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Uscita aggiornata')));
    }
  }

  Future<void> _openMaps(String luogo) async {
    final query = Uri.encodeComponent(luogo);
    final uri = Uri.parse(
      'https://www.google.com/maps/search/?api=1&query=$query',
    );
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Impossibile aprire Google Maps')),
      );
    }
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
    this.onTap,
  });

  final IconData icon;
  final String label;
  final String value;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final rowContent = Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.bold),
              ),
              Text(
                value,
                style: onTap != null
                    ? const TextStyle(
                        color: Colors.blueAccent,
                        decoration: TextDecoration.underline,
                      )
                    : null,
              ),
            ],
          ),
        ),
      ],
    );

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: onTap == null
          ? rowContent
          : InkWell(onTap: onTap, child: rowContent),
    );
  }
}

class PartecipantiSection extends StatefulWidget {
  const PartecipantiSection({
    super.key,
    required this.uscitaRef,
    required this.identity,
    required this.isChiusa,
  });

  final DocumentReference<Map<String, dynamic>> uscitaRef;
  final UserIdentity identity;
  final bool isChiusa;

  @override
  State<PartecipantiSection> createState() => _PartecipantiSectionState();
}

class _PartecipantiSectionState extends State<PartecipantiSection> {
  bool _selfAction = false;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
          stream: widget.uscitaRef
              .collection('partecipanti')
              .orderBy('addedAt', descending: true)
              .snapshots(),
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return Text('Errore partecipanti: ${snapshot.error}');
            }

            if (!snapshot.hasData) {
              return const Center(child: CircularProgressIndicator());
            }

            final docs = snapshot.data!.docs;
            final isSocio = widget.identity.isSocio;
            final socioId = widget.identity.socioId;
            final alreadyJoined =
                socioId != null && docs.any((doc) => doc.id == socioId);

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      'Partecipanti',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const Spacer(),
                    if (widget.identity.isAdmin && !widget.isChiusa)
                      FilledButton.icon(
                        icon: const Icon(Icons.person_add_alt_1),
                        label: const Text('Aggiungi'),
                        onPressed: () => _showAddPartecipanteDialog(),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                if (widget.identity.isSocio &&
                    !widget.identity.isAdmin &&
                    !widget.isChiusa)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: alreadyJoined
                        ? OutlinedButton.icon(
                            icon: _selfAction
                                ? const SizedBox(
                                    height: 16,
                                    width: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Icon(Icons.logout),
                            label: Text(
                              _selfAction
                                  ? 'Annullamento...'
                                  : 'Abbandona uscita',
                            ),
                            onPressed: _selfAction
                                ? null
                                : () => _removeSelf(socioId!),
                          )
                        : FilledButton.icon(
                            icon: _selfAction
                                ? const SizedBox(
                                    height: 16,
                                    width: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Icon(Icons.how_to_reg),
                            label: Text(
                              _selfAction
                                  ? 'Iscrizione...'
                                  : 'Partecipa come socio',
                            ),
                            onPressed: (socioId == null || _selfAction)
                                ? null
                                : _joinSelf,
                          ),
                  ),
                const SizedBox(height: 12),
                if (docs.isEmpty)
                  const Text('Nessun partecipante registrato.')
                else
                  ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: docs.length,
                    separatorBuilder: (_, __) => const Divider(height: 16),
                    itemBuilder: (context, index) {
                      final doc = docs[index];
                      final data = doc.data();
                      final nome = (data['nome'] ?? doc.id) as String;
                      final aggiuntoDa = (data['aggiuntoDa'] ?? '') as String;
                      final addedAt = data['addedAt'] as Timestamp?;
                      final bool canRemove =
                          widget.identity.isAdmin ||
                          (socioId != null && doc.id == socioId);

                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(nome),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(doc.id),
                            if (aggiuntoDa.isNotEmpty)
                              Text('aggiunto da: $aggiuntoDa'),
                            if (addedAt != null)
                              Text(
                                'il ${_formatTimestampLabel(addedAt, includeTime: true)}',
                              ),
                          ],
                        ),
                        trailing: canRemove && !widget.isChiusa
                            ? IconButton(
                                icon: const Icon(Icons.remove_circle_outline),
                                tooltip: 'Rimuovi',
                                onPressed: () => _removePartecipante(doc.id),
                              )
                            : null,
                      );
                    },
                  ),
              ],
            );
          },
        ),
      ),
    );
  }

  Future<void> _showAddPartecipanteDialog() async {
    final nomeController = TextEditingController();
    final idController = TextEditingController();
    final formKey = GlobalKey<FormState>();

    final conferma = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Nuovo partecipante'),
        content: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: nomeController,
                decoration: const InputDecoration(labelText: 'Nome completo'),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Inserisci il nome';
                  }
                  return null;
                },
              ),
              TextFormField(
                controller: idController,
                decoration: const InputDecoration(
                  labelText: 'Email o numero tessera',
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Inserisci un identificativo';
                  }
                  return null;
                },
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Annulla'),
          ),
          TextButton(
            onPressed: () {
              if (formKey.currentState!.validate()) {
                Navigator.of(ctx).pop(true);
              }
            },
            child: const Text('Aggiungi'),
          ),
        ],
      ),
    );

    if (conferma == true) {
      await _savePartecipante(
        socioId: idController.text.trim(),
        nome: nomeController.text.trim(),
        aggiuntoDa: widget.identity.displayName ?? 'Admin',
      );
    }
  }

  Future<void> _joinSelf() async {
    final socioId = widget.identity.socioId;
    if (socioId == null) return;
    setState(() => _selfAction = true);
    try {
      await _savePartecipante(
        socioId: socioId,
        nome: widget.identity.displayName ?? socioId,
        aggiuntoDa: 'self',
      );
    } catch (e) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Errore iscrizione: $e')));
    } finally {
      if (mounted) {
        setState(() => _selfAction = false);
      }
    }
  }

  Future<void> _savePartecipante({
    required String socioId,
    required String nome,
    required String aggiuntoDa,
  }) async {
    try {
      await FirebaseFirestore.instance.runTransaction((transaction) async {
        final docRef = widget.uscitaRef.collection('partecipanti').doc(socioId);
        final existing = await transaction.get(docRef);
        if (existing.exists) {
          throw Exception('Partecipante già presente');
        }
        transaction.set(docRef, {
          'nome': nome,
          'aggiuntoDa': aggiuntoDa,
          'socioId': socioId,
          'addedAt': FieldValue.serverTimestamp(),
        });
        transaction.update(widget.uscitaRef, {
          'partecipantiCount': FieldValue.increment(1),
        });
      });
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Partecipante aggiunto')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Errore: $e')));
      }
    }
  }

  Future<void> _removeSelf(String socioId) async {
    setState(() => _selfAction = true);
    try {
      await _removePartecipante(socioId);
    } finally {
      if (mounted) {
        setState(() => _selfAction = false);
      }
    }
  }

  Future<void> _removePartecipante(String socioId) async {
    try {
      await FirebaseFirestore.instance.runTransaction((transaction) async {
        final docRef = widget.uscitaRef.collection('partecipanti').doc(socioId);
        final snap = await transaction.get(docRef);
        if (!snap.exists) {
          throw Exception('Partecipante non trovato');
        }
        transaction.delete(docRef);
        transaction.update(widget.uscitaRef, {
          'partecipantiCount': FieldValue.increment(-1),
        });
      });
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Partecipante rimosso')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Errore rimozione: $e')));
      }
    }
  }
}

class MaterialiCollegatiSection extends StatefulWidget {
  const MaterialiCollegatiSection({
    super.key,
    required this.uscitaRef,
    required this.identity,
    required this.isChiusa,
    required this.uscitaTitle,
  });

  final DocumentReference<Map<String, dynamic>> uscitaRef;
  final UserIdentity identity;
  final bool isChiusa;
  final String uscitaTitle;

  @override
  State<MaterialiCollegatiSection> createState() =>
      _MaterialiCollegatiSectionState();
}

class FotoSection extends StatefulWidget {
  const FotoSection({
    super.key,
    required this.uscitaRef,
    required this.identity,
  });

  final DocumentReference<Map<String, dynamic>> uscitaRef;
  final UserIdentity identity;

  @override
  State<FotoSection> createState() => _FotoSectionState();
}

class _FotoSectionState extends State<FotoSection> {
  bool _uploading = false;
  final ImagePicker _picker = ImagePicker();

  bool get _canUpload => widget.identity.role != null;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text('Foto', style: Theme.of(context).textTheme.titleMedium),
                const Spacer(),
                if (_canUpload)
                  FilledButton.icon(
                    icon: _uploading
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.add_a_photo),
                    label: Text(
                      _uploading ? 'Caricamento...' : 'Aggiungi foto',
                    ),
                    onPressed: _uploading ? null : _pickImage,
                  ),
              ],
            ),
            const SizedBox(height: 12),
            StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
              stream: widget.uscitaRef
                  .collection('foto')
                  .orderBy('uploadedAt', descending: true)
                  .snapshots(),
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  return Text('Errore foto: ${snapshot.error}');
                }

                if (!snapshot.hasData) {
                  return const Center(child: CircularProgressIndicator());
                }

                final docs = snapshot.data!.docs;
                if (docs.isEmpty) {
                  return const Text('Nessuna foto caricata.');
                }

                return Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: docs.map((doc) {
                    final data = doc.data();
                    final url = (data['url'] ?? '') as String;
                    final base64Data = (data['data'] ?? '') as String;
                    final mime = (data['mime'] ?? 'image/jpeg') as String;
                    final autore = (data['uploadedBy'] ?? '') as String;
                    final ts = data['uploadedAt'] as Timestamp?;
                    final note = (data['fileName'] ?? '') as String;

                    return SizedBox(
                      width: 140,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          GestureDetector(
                            onTap: url.isNotEmpty || base64Data.isNotEmpty
                                ? () => _showPhoto(url, note, base64Data, mime)
                                : null,
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: AspectRatio(
                                aspectRatio: 4 / 3,
                                child: _buildImagePreview(
                                  url: url,
                                  base64Data: base64Data,
                                  mime: mime,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            autore,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                          if (ts != null)
                            Text(
                              _formatTimestampLabel(ts, includeTime: true),
                              style: Theme.of(context).textTheme.labelSmall,
                            ),
                          if (widget.identity.isAdmin)
                            Align(
                              alignment: Alignment.centerLeft,
                              child: IconButton(
                                icon: const Icon(Icons.delete_outline),
                                tooltip: 'Elimina foto',
                                onPressed: () => _deletePhoto(doc),
                              ),
                            ),
                        ],
                      ),
                    );
                  }).toList(),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickImage() async {
    if (!_canUpload) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Devi effettuare il login per caricare')),
      );
      return;
    }

    final XFile? file = await _picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 80,
    );
    if (file == null) return;

    setState(() => _uploading = true);
    try {
      final Uint8List bytes = await file.readAsBytes();
      String? downloadUrl;
      String? storagePath;
      if (!kIsWeb) {
        final path =
            'uscite/${widget.uscitaRef.id}/foto/${DateTime.now().millisecondsSinceEpoch}_${file.name}';
        final ref = FirebaseStorage.instance.ref(path);
        await ref.putData(
          bytes,
          SettableMetadata(contentType: file.mimeType ?? 'image/jpeg'),
        );
        downloadUrl = await ref.getDownloadURL();
        storagePath = path;
      }
      final Map<String, dynamic> docData = {
        'fileName': file.name,
        'uploadedBy':
            widget.identity.displayName ?? widget.identity.socioId ?? 'Anonimo',
        'uploadedAt': FieldValue.serverTimestamp(),
      };
      if (downloadUrl != null) {
        docData['url'] = downloadUrl;
        docData['storagePath'] = storagePath;
      }
      if (kIsWeb || downloadUrl == null) {
        docData['data'] = base64Encode(bytes);
        docData['mime'] = file.mimeType ?? 'image/jpeg';
      }
      await widget.uscitaRef.collection('foto').add(docData);
      await addAuditLog(
        'foto_caricata',
        socioId: widget.identity.socioId,
        nome: widget.identity.displayName,
        description: 'Foto caricata su uscita ${widget.uscitaRef.id}',
        extra: {'uscitaId': widget.uscitaRef.id, 'file': file.name},
      );
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Foto caricata')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Errore caricamento: $e')));
      }
    } finally {
      if (mounted) {
        setState(() => _uploading = false);
      }
    }
  }

  Widget _buildImagePreview({
    required String url,
    required String base64Data,
    required String mime,
  }) {
    if (url.isNotEmpty) {
      return Image.network(url, fit: BoxFit.cover);
    }
    if (base64Data.isNotEmpty) {
      final bytes = base64Decode(base64Data);
      return Image.memory(bytes, fit: BoxFit.cover);
    }
    return const ColoredBox(color: Colors.black12);
  }

  void _showPhoto(String url, String title, String base64Data, String mime) {
    showDialog(
      context: context,
      builder: (ctx) => Dialog(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (title.isNotEmpty)
              Padding(padding: const EdgeInsets.all(12), child: Text(title)),
            if (url.isNotEmpty)
              InteractiveViewer(child: Image.network(url, fit: BoxFit.contain))
            else if (base64Data.isNotEmpty)
              InteractiveViewer(
                child: Image.memory(
                  base64Decode(base64Data),
                  fit: BoxFit.contain,
                ),
              )
            else
              const SizedBox(height: 150),
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Chiudi'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _deletePhoto(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
  ) async {
    final conferma =
        await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Elimina foto'),
            content: const Text('Vuoi eliminare questa foto?'),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: const Text('Annulla'),
              ),
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(true),
                child: const Text('Elimina'),
              ),
            ],
          ),
        ) ??
        false;
    if (!conferma) return;

    try {
      final storagePath = doc.data()['storagePath'] as String?;
      if (storagePath != null) {
        await FirebaseStorage.instance.ref(storagePath).delete();
      }
      await doc.reference.delete();
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Foto eliminata')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Errore eliminazione: $e')));
      }
    }
  }
}

class CommentiSection extends StatefulWidget {
  const CommentiSection({
    super.key,
    required this.uscitaRef,
    required this.identity,
  });

  final DocumentReference<Map<String, dynamic>> uscitaRef;
  final UserIdentity identity;

  @override
  State<CommentiSection> createState() => _CommentiSectionState();
}

class _CommentiSectionState extends State<CommentiSection> {
  bool get _canComment => widget.identity.isAdmin || widget.identity.isSocio;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  'Commenti',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const Spacer(),
                if (_canComment)
                  FilledButton.icon(
                    icon: const Icon(Icons.add_comment),
                    label: const Text('Nuovo commento'),
                    onPressed: _addComment,
                  ),
              ],
            ),
            const SizedBox(height: 12),
            StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
              stream: widget.uscitaRef
                  .collection('commenti')
                  .orderBy('createdAt', descending: true)
                  .snapshots(),
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  return Text('Errore commenti: ${snapshot.error}');
                }

                if (!snapshot.hasData) {
                  return const Center(child: CircularProgressIndicator());
                }

                final docs = snapshot.data!.docs;
                if (docs.isEmpty) {
                  return const Text('Nessun commento presente.');
                }

                return ListView.separated(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: docs.length,
                  separatorBuilder: (_, __) => const Divider(height: 16),
                  itemBuilder: (context, index) {
                    final data = docs[index].data();
                    final testo = (data['testo'] ?? '') as String;
                    final autore = (data['autore'] ?? '') as String;
                    final ruolo = (data['ruolo'] ?? '') as String;
                    final ts = data['createdAt'] as Timestamp?;

                    return ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(testo),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('$autore (${ruolo.isEmpty ? 'utente' : ruolo})'),
                          if (ts != null)
                            Text(_formatTimestampLabel(ts, includeTime: true)),
                        ],
                      ),
                      trailing: widget.identity.isAdmin
                          ? IconButton(
                              icon: const Icon(Icons.delete_outline),
                              onPressed: () => _deleteComment(docs[index]),
                            )
                          : null,
                    );
                  },
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _addComment() async {
    if (!_canComment) return;
    final controller = TextEditingController();
    final testo = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Nuovo commento'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(labelText: 'Scrivi un commento'),
          maxLines: 3,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(null),
            child: const Text('Annulla'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(controller.text.trim()),
            child: const Text('Pubblica'),
          ),
        ],
      ),
    );
    if (testo == null || testo.isEmpty) return;

    try {
      await widget.uscitaRef.collection('commenti').add({
        'testo': testo,
        'autore':
            widget.identity.displayName ?? widget.identity.socioId ?? 'Anonimo',
        'ruolo': widget.identity.isAdmin ? 'admin' : 'socio',
        'createdAt': FieldValue.serverTimestamp(),
      });
      await addAuditLog(
        'commento_aggiunto',
        socioId: widget.identity.socioId,
        nome: widget.identity.displayName,
        description: 'Commento aggiunto su uscita ${widget.uscitaRef.id}',
        extra: {'uscitaId': widget.uscitaRef.id},
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Errore commento: $e')));
      }
    }
  }

  Future<void> _deleteComment(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
  ) async {
    final conferma =
        await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Elimina commento'),
            content: const Text('Vuoi eliminare questo commento?'),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: const Text('Annulla'),
              ),
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(true),
                child: const Text('Elimina'),
              ),
            ],
          ),
        ) ??
        false;
    if (!conferma) return;

    try {
      await doc.reference.delete();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Errore eliminazione: $e')));
      }
    }
  }
}

class _MaterialiCollegatiSectionState extends State<MaterialiCollegatiSection> {
  bool _loadingAction = false;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
          stream: widget.uscitaRef
              .collection('materiali')
              .orderBy('createdAt', descending: true)
              .snapshots(),
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return Text('Errore materiali: ${snapshot.error}');
            }

            if (!snapshot.hasData) {
              return const Center(child: CircularProgressIndicator());
            }

            final docs = snapshot.data!.docs;

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      'Materiali collegati',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const Spacer(),
                    if (widget.identity.isAdmin && !widget.isChiusa)
                      FilledButton.icon(
                        icon: const Icon(Icons.add_link),
                        label: const Text('Collega materiale'),
                        onPressed: _loadingAction
                            ? null
                            : () => _showAddMaterialeSheet(),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                if (docs.isEmpty)
                  const Text('Nessun materiale associato.')
                else
                  ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: docs.length,
                    separatorBuilder: (_, __) => const Divider(height: 16),
                    itemBuilder: (context, index) {
                      final doc = docs[index];
                      final data = doc.data();
                      final nome = (data['itemName'] ?? doc.id) as String;
                      final quantita = _toInt(data['quantita']);
                      final note = (data['note'] ?? '') as String;

                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(nome),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Quantità: $quantita'),
                            if (note.isNotEmpty) Text(note),
                          ],
                        ),
                        trailing: widget.identity.isAdmin && !widget.isChiusa
                            ? IconButton(
                                icon: const Icon(Icons.undo),
                                tooltip: 'Rilascia materiale',
                                onPressed: () => _releaseMateriale(doc),
                              )
                            : null,
                      );
                    },
                  ),
              ],
            );
          },
        ),
      ),
    );
  }

  Future<void> _showAddMaterialeSheet() async {
    setState(() => _loadingAction = true);
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: LinkMaterialeSheet(
          uscitaRef: widget.uscitaRef,
          uscitaTitle: widget.uscitaTitle,
        ),
      ),
    );
    if (mounted) {
      setState(() => _loadingAction = false);
    }
    if (result == true && mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Materiale collegato')));
    }
  }

  Future<void> _releaseMateriale(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
  ) async {
    try {
      final snap = await doc.reference.get();
      final data = snap.data();
      if (data == null) {
        await doc.reference.delete();
        return;
      }
      final itemId = data['itemId'] as String?;
      final quantita = _toInt(data['quantita']);
      if (itemId == null) {
        await doc.reference.delete();
        return;
      }
      final itemRef = FirebaseFirestore.instance
          .collection('items')
          .doc(itemId);
      final itemSnap = await itemRef.get();
      final itemData = itemSnap.data();
      final disponibile = _toInt(itemData?['qty_disponibile']);
      final prenotata = _toInt(itemData?['qty_prenotata']);
      await itemRef.update({
        'qty_disponibile': disponibile + quantita,
        'qty_prenotata': (prenotata - quantita) < 0 ? 0 : prenotata - quantita,
      });
      final prestitoId = data['prestitoId'] as String?;
      if (prestitoId != null) {
        final prestitoRef = FirebaseFirestore.instance
            .collection('prestiti_avanzati')
            .doc(prestitoId);
        final prestitoSnap = await prestitoRef.get();
        final currentPrestitoQty = _toInt(prestitoSnap.data()?['quantita']);
        final int newQty = math.max(0, currentPrestitoQty - quantita).toInt();
        final updateData = <String, dynamic>{'quantita': newQty};
        if (newQty <= 0) {
          updateData['stato'] = 'chiuso';
          updateData['dataRestituzione'] = FieldValue.serverTimestamp();
        }
        await prestitoRef.set(updateData, SetOptions(merge: true));
      }
      await doc.reference.delete();
      await widget.uscitaRef.update({
        'materialiCount': FieldValue.increment(-1),
      });
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Materiale rilasciato')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Errore rilascio: $e')));
      }
    }
  }
}

class LinkMaterialeSheet extends StatefulWidget {
  const LinkMaterialeSheet({
    super.key,
    required this.uscitaRef,
    required this.uscitaTitle,
  });

  final DocumentReference<Map<String, dynamic>> uscitaRef;
  final String uscitaTitle;

  @override
  State<LinkMaterialeSheet> createState() => _LinkMaterialeSheetState();
}

class _LinkMaterialeSheetState extends State<LinkMaterialeSheet> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _quantitaController = TextEditingController();
  final TextEditingController _noteController = TextEditingController();

  QueryDocumentSnapshot<Map<String, dynamic>>? _selectedItem;
  List<QueryDocumentSnapshot<Map<String, dynamic>>> _items = [];
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _loadItems();
  }

  @override
  void dispose() {
    _quantitaController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _loadItems() async {
    try {
      final snap = await FirebaseFirestore.instance
          .collection('items')
          .orderBy('nome')
          .get();
      setState(() {
        _items = snap.docs;
        _loading = false;
      });
    } catch (e) {
      setState(() => _loading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Errore caricamento materiali: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 24,
        bottom: 24 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Collega materiale',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<
                    QueryDocumentSnapshot<Map<String, dynamic>>
                  >(
                    value: _selectedItem,
                    items: _items
                        .map(
                          (doc) => DropdownMenuItem(
                            value: doc,
                            child: Text(doc.data()['nome'] ?? doc.id),
                          ),
                        )
                        .toList(),
                    decoration: const InputDecoration(
                      labelText: 'Materiale',
                      border: OutlineInputBorder(),
                    ),
                    onChanged: (value) {
                      setState(() {
                        _selectedItem = value;
                      });
                    },
                    validator: (value) {
                      if (value == null) {
                        return 'Seleziona un materiale';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _quantitaController,
                    decoration: const InputDecoration(
                      labelText: 'Quantità richiesta',
                      border: OutlineInputBorder(),
                    ),
                    keyboardType: TextInputType.number,
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return 'Inserisci una quantità';
                      }
                      final num? parsed = int.tryParse(value);
                      if (parsed == null || parsed <= 0) {
                        return 'Valore non valido';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _noteController,
                    decoration: const InputDecoration(
                      labelText: 'Note (opzionali)',
                      border: OutlineInputBorder(),
                    ),
                    maxLines: 2,
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      icon: _saving
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.save),
                      label: Text(
                        _saving ? 'Salvataggio...' : 'Collega materiale',
                      ),
                      onPressed: _saving ? null : _salva,
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Future<void> _salva() async {
    if (!_formKey.currentState!.validate()) return;
    final item = _selectedItem!;
    final data = item.data();
    final quantita = int.parse(_quantitaController.text.trim());
    setState(() => _saving = true);

    try {
      await FirebaseFirestore.instance.runTransaction((transaction) async {
        final itemRef = FirebaseFirestore.instance
            .collection('items')
            .doc(item.id);
        final itemSnap = await transaction.get(itemRef);
        final itemData = itemSnap.data() as Map<String, dynamic>?;
        if (itemData == null) {
          throw Exception('Materiale non trovato');
        }
        final disponibile = (itemData['qty_disponibile'] ?? 0) as int;
        final prenotata = (itemData['qty_prenotata'] ?? 0) as int;
        if (disponibile < quantita) {
          throw Exception('Disponibilità insufficiente ($disponibile)');
        }

        final materialiRef = widget.uscitaRef
            .collection('materiali')
            .doc(item.id);
        final existing = await transaction.get(materialiRef);
        final currentQty = (existing.data()?['quantita'] ?? 0) as int;
        final existingNote = (existing.data()?['note'] ?? '') as String;
        final noteInput = _noteController.text.trim();
        final noteToSave = noteInput.isNotEmpty ? noteInput : existingNote;

        final prestitoId = 'uscita_${widget.uscitaRef.id}_${item.id}';
        final prestitoRef = FirebaseFirestore.instance
            .collection('prestiti_avanzati')
            .doc(prestitoId);
        final prestitoSnap = await transaction.get(prestitoRef);
        final prestitoQty = (prestitoSnap.data()?['quantita'] ?? 0) as int;

        transaction.set(materialiRef, {
          'itemId': item.id,
          'itemName': data['nome'] ?? item.id,
          'quantita': currentQty + quantita,
          'note': noteToSave,
          'prestitoId': prestitoId,
          'createdAt': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));
        transaction.update(itemRef, {
          'qty_disponibile': disponibile - quantita,
          'qty_prenotata': prenotata + quantita,
        });
        if (!existing.exists) {
          transaction.update(widget.uscitaRef, {
            'materialiCount': FieldValue.increment(1),
          });
        }

        final prestitoData = <String, dynamic>{
          'itemId': item.id,
          'itemName': data['nome'] ?? item.id,
          'quantita': prestitoQty + quantita,
          'consegnatoA': 'Uscita: ${widget.uscitaTitle}',
          'stato': 'in corso',
          'uscitaId': widget.uscitaRef.id,
          'uscitaTitolo': widget.uscitaTitle,
          'note': noteToSave,
          'tipo': 'uscita',
        };
        if (!prestitoSnap.exists || (prestitoSnap.data()?['data'] == null)) {
          prestitoData['data'] = FieldValue.serverTimestamp();
        }
        transaction.set(prestitoRef, prestitoData, SetOptions(merge: true));
      });

      if (mounted) {
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      setState(() => _saving = false);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Errore collegamento: $e')));
    }
  }
}

Future<void> releaseMaterialiForUscita(
  DocumentReference<Map<String, dynamic>> uscitaRef,
) async {
  final materiali = await uscitaRef.collection('materiali').get();
  for (final doc in materiali.docs) {
    try {
      final snap = await doc.reference.get();
      final data = snap.data();
      if (data == null) {
        await doc.reference.delete();
        continue;
      }
      final itemId = data['itemId'] as String?;
      final quantita = _toInt(data['quantita']);
      if (itemId == null) {
        await doc.reference.delete();
        continue;
      }
      final itemRef = FirebaseFirestore.instance
          .collection('items')
          .doc(itemId);
      final itemSnap = await itemRef.get();
      final itemData = itemSnap.data();
      final disponibile = _toInt(itemData?['qty_disponibile']);
      final prenotata = _toInt(itemData?['qty_prenotata']);
      await itemRef.update({
        'qty_disponibile': disponibile + quantita,
        'qty_prenotata': (prenotata - quantita) < 0 ? 0 : prenotata - quantita,
      });
      final prestitoId = data['prestitoId'] as String?;
      if (prestitoId != null) {
        final prestitoRef = FirebaseFirestore.instance
            .collection('prestiti_avanzati')
            .doc(prestitoId);
        final prestitoSnap = await prestitoRef.get();
        final currentPrestitoQty = _toInt(prestitoSnap.data()?['quantita']);
        final int newQty = math.max(0, currentPrestitoQty - quantita).toInt();
        final updateData = <String, dynamic>{'quantita': newQty};
        if (newQty <= 0) {
          updateData['stato'] = 'chiuso';
          updateData['dataRestituzione'] = FieldValue.serverTimestamp();
        }
        await prestitoRef.set(updateData, SetOptions(merge: true));
      }
      await doc.reference.delete();
    } catch (_) {
      final prestitoId = doc.data()['prestitoId'] as String?;
      if (prestitoId != null) {
        await FirebaseFirestore.instance
            .collection('prestiti_avanzati')
            .doc(prestitoId)
            .set({
              'quantita': 0,
              'stato': 'chiuso',
              'dataRestituzione': FieldValue.serverTimestamp(),
            }, SetOptions(merge: true));
      }
      await doc.reference.delete();
    }
  }
  await uscitaRef.update({'materialiCount': 0});
}

/// =======================
///  REPORT ADMIN
/// =======================

class AdminReportsPage extends StatefulWidget {
  const AdminReportsPage({super.key});

  @override
  State<AdminReportsPage> createState() => _AdminReportsPageState();
}

class _AdminReportsPageState extends State<AdminReportsPage> {
  String? _exporting;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<UserIdentity>(
      valueListenable: userIdentityNotifier,
      builder: (context, identity, _) {
        final isAdmin = identity.isAdmin;
        return Scaffold(
          appBar: AppBar(title: const Text('Report amministratore')),
          body: isAdmin
              ? ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    _ReportCard(
                      title: 'Elenco soci',
                      description:
                          'Scarica anagrafica soci e stato quota aggiornato.',
                      csvBusy: _isExporting('soci_csv'),
                      pdfBusy: _isExporting('soci_pdf'),
                      xlsxBusy: _isExporting('soci_xlsx'),
                      onCsv: () => _exportSoci('csv'),
                      onPdf: () => _exportSoci('pdf'),
                      onXlsx: () => _exportSoci('xlsx'),
                    ),
                    _ReportCard(
                      title: 'Uscite',
                      description:
                          'Esporta elenco completo delle uscite registrate.',
                      csvBusy: _isExporting('uscite_csv'),
                      pdfBusy: _isExporting('uscite_pdf'),
                      xlsxBusy: _isExporting('uscite_xlsx'),
                      onCsv: () => _exportUscite('csv'),
                      onPdf: () => _exportUscite('pdf'),
                      onXlsx: () => _exportUscite('xlsx'),
                    ),
                    _ReportCard(
                      title: 'Inventario',
                      description:
                          'Scarica lo stato attuale dei materiali in magazzino.',
                      csvBusy: _isExporting('inventario_csv'),
                      pdfBusy: _isExporting('inventario_pdf'),
                      xlsxBusy: _isExporting('inventario_xlsx'),
                      onCsv: () => _exportInventario('csv'),
                      onPdf: () => _exportInventario('pdf'),
                      onXlsx: () => _exportInventario('xlsx'),
                    ),
                    _ReportCard(
                      title: 'Prestiti',
                      description:
                          'Crea un report con prestiti in corso e chiusi.',
                      csvBusy: _isExporting('prestiti_csv'),
                      pdfBusy: _isExporting('prestiti_pdf'),
                      xlsxBusy: _isExporting('prestiti_xlsx'),
                      onCsv: () => _exportPrestiti('csv'),
                      onPdf: () => _exportPrestiti('pdf'),
                      onXlsx: () => _exportPrestiti('xlsx'),
                    ),
                    _ReportCard(
                      title: 'Log accessi e azioni',
                      description:
                          'Storico di login e attività registrate (audit log).',
                      csvBusy: _isExporting('audit_csv'),
                      pdfBusy: _isExporting('audit_pdf'),
                      xlsxBusy: _isExporting('audit_xlsx'),
                      onCsv: () => _exportAuditLog('csv'),
                      onPdf: () => _exportAuditLog('pdf'),
                      onXlsx: () => _exportAuditLog('xlsx'),
                    ),
                    const SizedBox(height: 24),
                    const SociAdminPanel(),
                  ],
                )
              : Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: const [
                        Icon(Icons.lock, size: 64),
                        SizedBox(height: 12),
                        Text(
                          'Area riservata agli amministratori.\nAccedi come admin per generare i report.',
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  ),
                ),
        );
      },
    );
  }

  bool _isExporting(String key) => _exporting == key;

  Future<void> _exportSoci(String format) async {
    await _exportData(
      format: format,
      key: 'soci',
      fileName: 'soci.csv',
      headers: ['Tessera', 'Nome', 'Stato quota', 'Ultimo aggiornamento'],
      rowsBuilder: () async {
        final snap = await FirebaseFirestore.instance
            .collection('soci_status')
            .orderBy(FieldPath.documentId)
            .get();
        return snap.docs.map((doc) {
          final data = doc.data();
          final attivo = _parseBool(data['attivo'], fallback: true);
          final ts = data['updatedAt'] as Timestamp?;
          return [
            doc.id,
            (data['nome'] ?? '').toString(),
            attivo ? 'In regola' : 'Sospeso',
            _formatTimestampLabel(ts, includeTime: true),
          ];
        }).toList();
      },
    );
  }

  Future<void> _exportUscite(String format) async {
    await _exportData(
      format: format,
      key: 'uscite',
      fileName: 'uscite.csv',
      headers: [
        'ID',
        'Titolo',
        'Luogo',
        'Data',
        'Responsabile',
        'Tipo',
        'Stato',
        'Partecipanti',
        'Note/Commenti',
      ],
      rowsBuilder: () async {
        final snap = await FirebaseFirestore.instance
            .collection('uscite')
            .get();
        final rows = <List<String>>[];
        for (final entry in snap.docs.asMap().entries) {
          final doc = entry.value;
          final index = entry.key + 1;
          final data = doc.data()!;
          final ts = data['dataInizio'] as Timestamp?;
          final partecipantiSnap = await doc.reference
              .collection('partecipanti')
              .get();
          final partecipanti = partecipantiSnap.docs
              .map((p) => (p.data()['nome'] ?? p.id).toString())
              .join(', ');
          final note = (data['note'] ?? '').toString();
          final commento = (data['commento'] ?? '').toString();
          final noteCommenti = [
            note,
            commento,
          ].where((element) => element.trim().isNotEmpty).join(' | ');
          rows.add([
            '$index',
            (data['titolo'] ?? '').toString(),
            (data['luogo'] ?? '').toString(),
            _formatTimestampLabel(ts, includeTime: true),
            (data['responsabile'] ?? '').toString(),
            (data['tipo'] ?? '').toString(),
            (data['stato'] ?? '').toString(),
            partecipanti,
            noteCommenti,
          ]);
        }
        return rows;
      },
    );
  }

  Future<void> _exportInventario(String format) async {
    await _exportData(
      format: format,
      key: 'inventario',
      fileName: 'inventario.csv',
      headers: [
        'ID',
        'Nome',
        'Descrizione',
        'Totale',
        'Disponibile',
        'Prenotata',
      ],
      rowsBuilder: () async {
        final snap = await FirebaseFirestore.instance.collection('items').get();
        return snap.docs.asMap().entries.map((entry) {
          final doc = entry.value;
          final index = entry.key + 1;
          final data = doc.data()!;
          return [
            '$index',
            (data['nome'] ?? '').toString(),
            (data['descrizione'] ?? '').toString(),
            '${data['qty_totale'] ?? ''}',
            '${data['qty_disponibile'] ?? ''}',
            '${data['qty_prenotata'] ?? ''}',
          ];
        }).toList();
      },
    );
  }

  Future<void> _exportPrestiti(String format) async {
    await _exportData(
      format: format,
      key: 'prestiti',
      fileName: 'prestiti.csv',
      headers: [
        'ID',
        'Materiale',
        'Quantità',
        'Consegnato a',
        'Data prestito',
        'Data restituzione',
        'Stato',
      ],
      rowsBuilder: () async {
        final snap = await FirebaseFirestore.instance
            .collection('prestiti_avanzati')
            .get();
        return snap.docs.asMap().entries.map((entry) {
          final doc = entry.value;
          final index = entry.key + 1;
          final data = doc.data()!;
          final ts = data['data'] as Timestamp?;
          final tsRest = data['dataRestituzione'] as Timestamp?;
          return [
            '$index',
            (data['itemName'] ?? '').toString(),
            '${data['quantita'] ?? ''}',
            (data['consegnatoA'] ?? '').toString(),
            _formatTimestampLabel(ts, includeTime: true),
            _formatTimestampLabel(tsRest, includeTime: true),
            (data['stato'] ?? '').toString(),
          ];
        }).toList();
      },
    );
  }

  Future<void> _exportAuditLog(String format) async {
    await _exportData(
      format: format,
      key: 'audit',
      fileName: 'audit_logs.csv',
      headers: [
        'ID',
        'Nome',
        'Tessera',
        'Azione',
        'Descrizione',
        'Timestamp',
        'Dettagli',
      ],
      rowsBuilder: () async {
        final snap = await FirebaseFirestore.instance
            .collection('audit_logs')
            .orderBy('timestamp')
            .get();
        final rows = <List<String>>[];
        final Map<String, int> countBySocio = {};
        for (final entry in snap.docs.asMap().entries) {
          final doc = entry.value;
          final data = doc.data();
          final nome = (data['nome'] ?? '').toString();
          final tessera = (data['socioId'] ?? '').toString();
          final action = (data['action'] ?? '').toString();
          final description = (data['description'] ?? '').toString();
          final ts = data['timestamp'] as Timestamp?;
          final extra = (data['extra'] ?? {}).toString();
          final key = '$nome|$tessera';
          countBySocio[key] = (countBySocio[key] ?? 0) + 1;
          rows.add([
            '${entry.key + 1}',
            nome,
            tessera,
            action,
            description,
            _formatTimestampLabel(ts, includeTime: true),
            extra,
          ]);
        }
        if (rows.isNotEmpty) {
          rows.add(const ['', '', '', '', '', '', '']);
          rows.add(const ['Riepilogo per socio', '', '', '', '', '', '']);
          for (final entry in countBySocio.entries) {
            final parts = entry.key.split('|');
            rows.add([
              '',
              parts[0],
              parts.length > 1 ? parts[1] : '',
              'Totale azioni',
              '${entry.value}',
              '',
              '',
            ]);
          }
        }
        return rows;
      },
    );
  }

  Future<void> _exportData({
    required String format,
    required String key,
    required String fileName,
    required List<String> headers,
    required Future<List<List<String>>> Function() rowsBuilder,
  }) async {
    setState(() => _exporting = '${key}_$format');
    try {
      final rows = await rowsBuilder();
      switch (format) {
        case 'pdf':
          final bytes = await _buildPdf(
            title: key.toUpperCase(),
            headers: headers,
            rows: rows,
          );
          await _deliverBytes(
            fileName.replaceAll('.csv', '.pdf'),
            bytes,
            'application/pdf',
          );
          break;
        case 'xlsx':
          final bytes = _buildXlsx(headers, rows);
          await _deliverBytes(
            fileName.replaceAll('.csv', '.xlsx'),
            bytes,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          );
          break;
        default:
          final csv = _buildCsv(headers, rows);
          await _deliverCsv(fileName, csv);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Errore esportazione: $e')));
      }
    } finally {
      if (mounted) {
        setState(() => _exporting = null);
      }
    }
  }

  Future<void> _deliverCsv(String fileName, String content) async {
    final bytes = Uint8List.fromList(utf8.encode(content));
    final launched = await _deliverBytes(fileName, bytes, 'text/csv');
    if (!launched && mounted) {
      await Clipboard.setData(ClipboardData(text: content));
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Download non supportato: CSV copiato negli appunti ($fileName).',
          ),
        ),
      );
    } else if (launched && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Report CSV aperto (salva come $fileName)')),
      );
    }
  }

  Future<bool> _deliverBytes(
    String fileName,
    Uint8List bytes,
    String mimeType,
  ) async {
    if (await file_saver.saveBytes(fileName, bytes, mimeType)) {
      return true;
    }
    final uri = Uri.dataFromBytes(bytes, mimeType: mimeType);
    try {
      return await launchUrl(uri);
    } catch (_) {
      return false;
    }
  }

  String _buildCsv(List<String> headers, List<List<String>> rows) {
    final buffer = StringBuffer();
    buffer.writeln(headers.map(_escapeCsv).join(';'));
    for (final row in rows) {
      buffer.writeln(row.map(_escapeCsv).join(';'));
    }
    return buffer.toString();
  }

  String _escapeCsv(String value) {
    final sanitized = value.replaceAll('"', '""');
    return '"$sanitized"';
  }

  Future<Uint8List> _buildPdf({
    required String title,
    required List<String> headers,
    required List<List<String>> rows,
  }) async {
    final doc = pw.Document();
    final columnWidths = <int, pw.TableColumnWidth>{
      for (var i = 0; i < headers.length; i++) i: const pw.FlexColumnWidth(),
    };
    doc.addPage(
      pw.MultiPage(
        pageTheme: pw.PageTheme(
          margin: const pw.EdgeInsets.symmetric(horizontal: 24, vertical: 28),
        ),
        build: (context) => [
          pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Text(
                'Gruppo Speleo Urbino',
                style: pw.TextStyle(
                  fontSize: 22,
                  fontWeight: pw.FontWeight.bold,
                ),
              ),
              pw.SizedBox(height: 4),
              pw.Text(
                '$title - Report',
                style: pw.TextStyle(fontSize: 14, color: PdfColors.grey700),
              ),
            ],
          ),
          pw.SizedBox(height: 12),
          pw.Table.fromTextArray(
            headers: headers,
            data: rows,
            headerStyle: pw.TextStyle(
              fontWeight: pw.FontWeight.bold,
              color: PdfColors.white,
            ),
            headerDecoration: pw.BoxDecoration(
              color: PdfColor.fromHex('#512DA8'),
            ),
            cellAlignment: pw.Alignment.centerLeft,
            cellStyle: const pw.TextStyle(fontSize: 10),
            cellPadding: const pw.EdgeInsets.symmetric(
              horizontal: 6,
              vertical: 4,
            ),
            columnWidths: columnWidths,
            border: pw.TableBorder.all(color: PdfColors.grey400, width: 0.5),
          ),
        ],
      ),
    );
    final saved = await doc.save();
    return Uint8List.fromList(saved);
  }

  Uint8List _buildXlsx(List<String> headers, List<List<String>> rows) {
    final excel = Excel.createExcel();
    final sheet = excel['Report'];
    sheet.appendRow(headers.map<CellValue?>((h) => TextCellValue(h)).toList());
    for (final row in rows) {
      sheet.appendRow(
        row.map<CellValue?>((value) => TextCellValue(value)).toList(),
      );
    }
    final bytes = excel.encode();
    return bytes != null ? Uint8List.fromList(bytes) : Uint8List(0);
  }
}

class _ReportCard extends StatelessWidget {
  const _ReportCard({
    required this.title,
    required this.description,
    required this.csvBusy,
    required this.pdfBusy,
    required this.xlsxBusy,
    required this.onCsv,
    required this.onPdf,
    required this.onXlsx,
  });

  final String title;
  final String description;
  final bool csvBusy;
  final bool pdfBusy;
  final bool xlsxBusy;
  final VoidCallback? onCsv;
  final VoidCallback? onPdf;
  final VoidCallback? onXlsx;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(description),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    icon: csvBusy
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.table_rows),
                    label: Text(csvBusy ? 'CSV...' : 'CSV'),
                    onPressed: csvBusy ? null : onCsv,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    icon: pdfBusy
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.picture_as_pdf),
                    label: Text(pdfBusy ? 'PDF...' : 'PDF'),
                    onPressed: pdfBusy ? null : onPdf,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    icon: xlsxBusy
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.grid_on),
                    label: Text(xlsxBusy ? 'XLSX...' : 'XLSX'),
                    onPressed: xlsxBusy ? null : onXlsx,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

enum SociStatusFilter { tutti, attivi, sospesi }

class SociAdminPanel extends StatefulWidget {
  const SociAdminPanel({super.key});

  @override
  State<SociAdminPanel> createState() => _SociAdminPanelState();
}

class _SociAdminPanelState extends State<SociAdminPanel> {
  final TextEditingController _searchController = TextEditingController();
  SociStatusFilter _filter = SociStatusFilter.tutti;
  bool _syncing = false;
  final Map<String, bool> _updating = {};

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  'Gestione soci',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const Spacer(),
                OutlinedButton.icon(
                  icon: const Icon(Icons.person_add_alt),
                  label: const Text('Aggiungi socio'),
                  onPressed: _addSocio,
                ),
                const SizedBox(width: 8),
                FilledButton.icon(
                  icon: _syncing
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.refresh),
                  label: Text(
                    _syncing ? 'Sincronizzo...' : 'Sincronizza elenco',
                  ),
                  onPressed: _syncing ? null : _sync,
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _searchController,
              decoration: const InputDecoration(
                labelText: 'Cerca per nome o tessera',
                prefixIcon: Icon(Icons.search),
              ),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              children: [
                ChoiceChip(
                  label: const Text('Tutti'),
                  selected: _filter == SociStatusFilter.tutti,
                  onSelected: (_) =>
                      setState(() => _filter = SociStatusFilter.tutti),
                ),
                ChoiceChip(
                  label: const Text('In regola'),
                  selected: _filter == SociStatusFilter.attivi,
                  onSelected: (_) =>
                      setState(() => _filter = SociStatusFilter.attivi),
                ),
                ChoiceChip(
                  label: const Text('Sospesi'),
                  selected: _filter == SociStatusFilter.sospesi,
                  onSelected: (_) =>
                      setState(() => _filter = SociStatusFilter.sospesi),
                ),
              ],
            ),
            const SizedBox(height: 12),
            StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
              stream: FirebaseFirestore.instance
                  .collection('soci_status')
                  .orderBy(FieldPath.documentId)
                  .snapshots(),
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  return Text('Errore soci: ${snapshot.error}');
                }
                if (!snapshot.hasData) {
                  return const Padding(
                    padding: EdgeInsets.all(24),
                    child: Center(child: CircularProgressIndicator()),
                  );
                }
                final docs = snapshot.data!.docs;
                final search = _searchController.text.trim().toLowerCase();
                final filtered = docs.where((doc) {
                  final data = doc.data();
                  final attivo = _parseBool(data['attivo'], fallback: true);
                  if (_filter == SociStatusFilter.attivi && !attivo) {
                    return false;
                  }
                  if (_filter == SociStatusFilter.sospesi && attivo) {
                    return false;
                  }
                  if (search.isEmpty) return true;
                  final nome = (data['nome'] ?? '').toString().toLowerCase();
                  final tessera = doc.id.toLowerCase();
                  return nome.contains(search) || tessera.contains(search);
                }).toList();

                if (filtered.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text('Nessun socio corrisponde ai filtri.'),
                  );
                }

                final sorted = filtered.toList()
                  ..sort((a, b) {
                    final ai = int.tryParse(a.id);
                    final bi = int.tryParse(b.id);
                    if (ai != null && bi != null) {
                      return ai.compareTo(bi);
                    }
                    if (ai != null) return -1;
                    if (bi != null) return 1;
                    return a.id.compareTo(b.id);
                  });

                return Column(
                  children: sorted.map((doc) {
                    final data = doc.data();
                    final nome = (data['nome'] ?? doc.id).toString();
                    final attivo = _parseBool(data['attivo'], fallback: true);
                    final updating = _updating[doc.id] == true;
                    return ListTile(
                      title: Text(nome),
                      subtitle: Text(
                        'Tessera: ${doc.id}  |  Stato: ${attivo ? 'in regola' : 'sospeso'}',
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Switch(
                            value: attivo,
                            onChanged: updating
                                ? null
                                : (value) => _updateStatus(doc, value),
                          ),
                          IconButton(
                            icon: const Icon(Icons.delete_outline),
                            tooltip: 'Rimuovi',
                            onPressed: updating
                                ? null
                                : () => _deleteSocio(doc),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _sync() async {
    setState(() => _syncing = true);
    try {
      await syncSociStatus();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Elenco soci sincronizzato')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Errore sincronizzazione: $e')));
      }
    } finally {
      if (mounted) {
        setState(() => _syncing = false);
      }
    }
  }

  Future<void> _updateStatus(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
    bool attivo,
  ) async {
    setState(() => _updating[doc.id] = true);
    try {
      await doc.reference.update({
        'attivo': attivo,
        'updatedAt': FieldValue.serverTimestamp(),
      });
      await addAuditLog(
        attivo ? 'socio_riattivato' : 'socio_sospeso',
        socioId: doc.id,
        nome: doc.data()['nome'] as String? ?? doc.id,
        description: attivo
            ? 'Quota regolarizzata'
            : 'Quota sospesa dall’amministratore',
      );
    } catch (e) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Errore aggiornamento: $e')));
    } finally {
      if (mounted) {
        setState(() => _updating.remove(doc.id));
      }
    }
  }

  Future<void> _addSocio() async {
    final tesseraController = TextEditingController();
    final nomeController = TextEditingController();
    bool attivo = true;

    final conferma =
        await showDialog<bool>(
          context: context,
          builder: (ctx) {
            return StatefulBuilder(
              builder: (ctx, setStateDialog) => AlertDialog(
                title: const Text('Nuovo socio'),
                content: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: tesseraController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Numero tessera',
                      ),
                    ),
                    TextField(
                      controller: nomeController,
                      decoration: const InputDecoration(
                        labelText: 'Nome completo',
                      ),
                    ),
                    SwitchListTile(
                      title: const Text('In regola con la quota'),
                      value: attivo,
                      onChanged: (value) {
                        setStateDialog(() => attivo = value);
                      },
                    ),
                  ],
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.of(ctx).pop(false),
                    child: const Text('Annulla'),
                  ),
                  TextButton(
                    onPressed: () => Navigator.of(ctx).pop(true),
                    child: const Text('Salva'),
                  ),
                ],
              ),
            );
          },
        ) ??
        false;

    if (!conferma) return;

    final tessera = tesseraController.text.trim();
    final nome = nomeController.text.trim();

    if (tessera.isEmpty || nome.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Tessera e nome sono obbligatori')),
      );
      return;
    }

    try {
      await FirebaseFirestore.instance
          .collection('soci_status')
          .doc(tessera)
          .set({
            'nome': nome,
            'nomeKey': normalizeSocioKey(nome),
            'attivo': attivo,
            'updatedAt': FieldValue.serverTimestamp(),
          });
      await addAuditLog(
        'socio_aggiunto',
        socioId: tessera,
        nome: nome,
        description: 'Nuovo socio aggiunto dall’admin',
      );
    } catch (e) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Errore aggiunta: $e')));
    }
  }

  Future<void> _deleteSocio(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
  ) async {
    final conferma =
        await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Rimuovi socio'),
            content: Text(
              'Rimuovere definitivamente ${doc.data()['nome'] ?? doc.id}?',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: const Text('Annulla'),
              ),
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(true),
                child: const Text('Rimuovi'),
              ),
            ],
          ),
        ) ??
        false;
    if (!conferma) return;

    try {
      await doc.reference.delete();
      await addAuditLog(
        'socio_rimosso',
        socioId: doc.id,
        nome: doc.data()['nome'] as String? ?? doc.id,
        description: 'Socio rimosso dall’admin',
      );
    } catch (e) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Errore rimozione: $e')));
    }
  }
}

/// =======================
///  PRESTITI (pagina con form + storico)
/// =======================

class PrestitiPage extends StatelessWidget {
  const PrestitiPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Prestito avanzato'),
        actions: [
          IconButton(
            icon: const Icon(Icons.history),
            tooltip: 'Storico prestiti',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const StoricoPrestitiPage()),
              );
            },
          ),
        ],
      ),
      body: const Padding(
        padding: EdgeInsets.all(16),
        child: PrestitoAvanzatoForm(),
      ),
    );
  }
}

/// =======================
///  PRESTITO AVANZATO - FORM
/// =======================

class PrestitoAvanzatoForm extends StatefulWidget {
  const PrestitoAvanzatoForm({super.key});

  @override
  State<PrestitoAvanzatoForm> createState() => _PrestitoAvanzatoFormState();
}

class _PrestitoAvanzatoFormState extends State<PrestitoAvanzatoForm> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();

  final TextEditingController _quantitaController = TextEditingController();
  final TextEditingController _consegnatoAController = TextEditingController();
  final TextEditingController _noteController = TextEditingController();

  List<QueryDocumentSnapshot<Map<String, dynamic>>> _items = [];
  QueryDocumentSnapshot<Map<String, dynamic>>? _selectedItem;
  int _maxDisponibile = 0;

  bool _loadingItems = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _loadItems();
  }

  @override
  void dispose() {
    _quantitaController.dispose();
    _consegnatoAController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _loadItems() async {
    try {
      final snapshot = await FirebaseFirestore.instance
          .collection('items')
          .orderBy('nome')
          .get();

      setState(() {
        _items = snapshot.docs;
        _loadingItems = false;
      });
    } catch (e) {
      setState(() => _loadingItems = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Errore nel caricamento materiali: $e')),
        );
      }
    }
  }

  Future<void> _registerLoan() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedItem == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Seleziona un materiale')));
      return;
    }

    final int richiesta = int.parse(_quantitaController.text.trim());
    final docRef = FirebaseFirestore.instance
        .collection('items')
        .doc(_selectedItem!.id);
    final prestitiRef = FirebaseFirestore.instance.collection(
      'prestiti_avanzati',
    );

    setState(() => _saving = true);

    try {
      await FirebaseFirestore.instance.runTransaction((transaction) async {
        final snap = await transaction.get(docRef);
        final data = snap.data() as Map<String, dynamic>?;

        if (data == null) {
          throw Exception('Materiale non trovato');
        }

        final int disponibile = (data['qty_disponibile'] ?? 0) as int;

        if (richiesta > disponibile) {
          throw Exception(
            'Richiesti $richiesta pezzi, ma ne sono disponibili solo $disponibile.',
          );
        }

        // Aggiorna quantità disponibile
        transaction.update(docRef, {
          'qty_disponibile': disponibile - richiesta,
        });

        // Registra il prestito
        transaction.set(prestitiRef.doc(), {
          'itemId': docRef.id,
          'itemName': data['nome'] ?? '',
          'quantita': richiesta,
          'consegnatoA': _consegnatoAController.text.trim(),
          'note': _noteController.text.trim(),
          'data': FieldValue.serverTimestamp(),
          'stato': 'in corso',
        });
      });

      // Pulisci il form
      _quantitaController.clear();
      _consegnatoAController.clear();
      _noteController.clear();

      setState(() {
        _selectedItem = null;
        _maxDisponibile = 0;
      });

      await _loadItems();

      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Prestito registrato 👍')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Errore nella registrazione: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.all(8),
        children: [
          const Text(
            'Prestito avanzato',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 16),

          // Dropdown materiale
          if (_loadingItems)
            const Center(child: CircularProgressIndicator())
          else
            DropdownButtonFormField<
              QueryDocumentSnapshot<Map<String, dynamic>>
            >(
              value: _selectedItem,
              decoration: const InputDecoration(
                labelText: 'Materiale',
                border: OutlineInputBorder(),
              ),
              items: _items.map((doc) {
                final data = doc.data();
                final nome = data['nome'] ?? '';
                final disp = data['qty_disponibile'] ?? 0;
                return DropdownMenuItem<
                  QueryDocumentSnapshot<Map<String, dynamic>>
                >(value: doc, child: Text('$nome (disp: $disp)'));
              }).toList(),
              onChanged: (value) {
                setState(() {
                  _selectedItem = value;
                  if (value != null) {
                    final data = value.data();
                    _maxDisponibile = (data['qty_disponibile'] ?? 0) as int;
                  } else {
                    _maxDisponibile = 0;
                  }
                });
              },
              validator: (value) =>
                  value == null ? 'Seleziona un materiale' : null,
            ),

          const SizedBox(height: 16),

          // Quantità
          TextFormField(
            controller: _quantitaController,
            decoration: InputDecoration(
              labelText: 'Quantità',
              border: const OutlineInputBorder(),
              helperText: _maxDisponibile > 0
                  ? 'Disponibili: $_maxDisponibile'
                  : null,
            ),
            keyboardType: TextInputType.number,
            validator: (value) {
              if (value == null || value.trim().isEmpty) {
                return 'Inserisci una quantità';
              }
              final n = int.tryParse(value.trim());
              if (n == null || n <= 0) {
                return 'Quantità non valida';
              }
              if (n > _maxDisponibile) {
                return 'Non puoi superare i disponibili ($_maxDisponibile)';
              }
              return null;
            },
          ),

          const SizedBox(height: 16),

          // Consegnato a
          TextFormField(
            controller: _consegnatoAController,
            decoration: const InputDecoration(
              labelText: 'Consegnato a',
              border: OutlineInputBorder(),
            ),
            validator: (value) {
              if (value == null || value.trim().isEmpty) {
                return 'Indica a chi consegni il materiale';
              }
              return null;
            },
          ),

          const SizedBox(height: 16),

          // Note
          TextFormField(
            controller: _noteController,
            decoration: const InputDecoration(
              labelText: 'Note (facoltative)',
              border: OutlineInputBorder(),
            ),
            maxLines: 3,
          ),

          const SizedBox(height: 24),

          // Bottone registra
          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton.icon(
              onPressed: _saving ? null : _registerLoan,
              icon: _saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.save),
              label: Text(_saving ? 'Salvataggio...' : 'Registra prestito'),
            ),
          ),
        ],
      ),
    );
  }
}

/// =======================
///  STORICO PRESTITI
/// =======================

enum PrestitoFilter { tutti, inCorso, chiusi }

class StoricoPrestitiPage extends StatefulWidget {
  const StoricoPrestitiPage({super.key});

  @override
  State<StoricoPrestitiPage> createState() => _StoricoPrestitiPageState();
}

class _StoricoPrestitiPageState extends State<StoricoPrestitiPage> {
  final TextEditingController _searchController = TextEditingController();
  PrestitoFilter _filtro = PrestitoFilter.tutti;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  String _formatDateTime(Timestamp? ts) {
    if (ts == null) return '';
    final d = ts.toDate();
    final dd = d.day.toString().padLeft(2, '0');
    final mm = d.month.toString().padLeft(2, '0');
    final yyyy = d.year.toString();
    final hh = d.hour.toString().padLeft(2, '0');
    final min = d.minute.toString().padLeft(2, '0');
    return '$dd/$mm/$yyyy $hh:$min';
  }

  Future<void> _restituisciPrestito(
    BuildContext context,
    QueryDocumentSnapshot<Map<String, dynamic>> prestitoDoc,
  ) async {
    // dialog di conferma
    final confermato =
        await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Conferma restituzione'),
            content: const Text(
              'Vuoi segnare questo prestito come restituito e aggiornare l’inventario?',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: const Text('Annulla'),
              ),
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(true),
                child: const Text('Conferma'),
              ),
            ],
          ),
        ) ??
        false;

    if (!confermato) return;

    try {
      await FirebaseFirestore.instance.runTransaction((transaction) async {
        final prestitoSnap = await transaction.get(prestitoDoc.reference);
        final prestitoData = prestitoSnap.data() as Map<String, dynamic>?;

        if (prestitoData == null) {
          throw Exception('Dati prestito non trovati');
        }

        final statoCorrente = prestitoData['stato'] ?? 'in corso';
        if (statoCorrente == 'chiuso') {
          throw Exception('Prestito già chiuso');
        }

        final int quantita = (prestitoData['quantita'] ?? 0) as int;
        final String? itemId = prestitoData['itemId'] as String?;

        if (itemId == null) {
          throw Exception('itemId mancante nel prestito');
        }

        // Leggo il materiale
        final itemRef = FirebaseFirestore.instance
            .collection('items')
            .doc(itemId);
        final itemSnap = await transaction.get(itemRef);
        final itemData = itemSnap.data() as Map<String, dynamic>?;

        if (itemData == null) {
          throw Exception('Materiale non trovato');
        }

        final int disponibile = (itemData['qty_disponibile'] ?? 0) as int;

        // 1) Aggiorno l’inventario
        transaction.update(itemRef, {
          'qty_disponibile': disponibile + quantita,
        });

        // 2) Aggiorno il prestito come chiuso
        transaction.update(prestitoDoc.reference, {
          'stato': 'chiuso',
          'dataRestituzione': FieldValue.serverTimestamp(),
        });
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Prestito segnato come restituito ✅')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Errore nella restituzione: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Storico prestiti')),
      body: Column(
        children: [
          // barra di ricerca
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: TextField(
              controller: _searchController,
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                labelText: 'Cerca per materiale o persona',
                border: OutlineInputBorder(),
              ),
              onChanged: (_) => setState(() {}),
            ),
          ),

          // filtri stato
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Wrap(
              spacing: 8,
              children: [
                ChoiceChip(
                  label: const Text('Tutti'),
                  selected: _filtro == PrestitoFilter.tutti,
                  onSelected: (_) {
                    setState(() => _filtro = PrestitoFilter.tutti);
                  },
                ),
                ChoiceChip(
                  label: const Text('In corso'),
                  selected: _filtro == PrestitoFilter.inCorso,
                  onSelected: (_) {
                    setState(() => _filtro = PrestitoFilter.inCorso);
                  },
                ),
                ChoiceChip(
                  label: const Text('Chiusi'),
                  selected: _filtro == PrestitoFilter.chiusi,
                  onSelected: (_) {
                    setState(() => _filtro = PrestitoFilter.chiusi);
                  },
                ),
              ],
            ),
          ),

          const SizedBox(height: 8),

          // lista
          Expanded(
            child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
              stream: FirebaseFirestore.instance
                  .collection('prestiti_avanzati')
                  .orderBy('data', descending: true)
                  .snapshots(),
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  return Center(
                    child: Text('Errore nel caricamento: ${snapshot.error}'),
                  );
                }

                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }

                final docs = snapshot.data?.docs ?? [];

                if (docs.isEmpty) {
                  return const Center(
                    child: Text('Nessun prestito registrato.'),
                  );
                }

                // Applico filtri e ricerca
                final search = _searchController.text.trim().toLowerCase();
                final filteredDocs = docs.where((doc) {
                  final data = doc.data();
                  final stato = (data['stato'] ?? 'in corso') as String;

                  // filtro stato
                  if (_filtro == PrestitoFilter.inCorso &&
                      stato != 'in corso') {
                    return false;
                  }
                  if (_filtro == PrestitoFilter.chiusi && stato != 'chiuso') {
                    return false;
                  }

                  // filtro ricerca
                  if (search.isNotEmpty) {
                    final nome = (data['itemName'] ?? '') as String;
                    final consegnatoA = (data['consegnatoA'] ?? '') as String;
                    final testo = (nome + ' ' + consegnatoA).toLowerCase();
                    if (!testo.contains(search)) return false;
                  }

                  return true;
                }).toList();

                if (filteredDocs.isEmpty) {
                  return const Center(
                    child: Text('Nessun prestito corrisponde ai filtri.'),
                  );
                }

                return ListView.builder(
                  itemCount: filteredDocs.length,
                  itemBuilder: (context, index) {
                    final doc = filteredDocs[index];
                    final data = doc.data();

                    final nome = (data['itemName'] ?? 'Senza nome') as String;
                    final quantita = (data['quantita'] ?? 0) as int;
                    final consegnatoA = (data['consegnatoA'] ?? '') as String;
                    final tsData = data['data'] as Timestamp?;
                    final tsRest = data['dataRestituzione'] as Timestamp?;
                    final stato = (data['stato'] ?? 'in corso') as String;

                    final dataPrestito = _formatDateTime(tsData);
                    final dataRestituzione = tsRest != null
                        ? _formatDateTime(tsRest)
                        : '';

                    final bool isChiuso = stato == 'chiuso';

                    return Card(
                      margin: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      child: ListTile(
                        title: Text('$nome  x $quantita'),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (consegnatoA.isNotEmpty) Text('a: $consegnatoA'),
                            if (dataPrestito.isNotEmpty)
                              Text('il: $dataPrestito'),
                            if (isChiuso && dataRestituzione.isNotEmpty)
                              Text('restituito il: $dataRestituzione'),
                            Text(
                              'stato: $stato',
                              style: TextStyle(
                                color: isChiuso
                                    ? Colors.green[700]
                                    : Colors.orange[800],
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            if (!isChiuso)
                              Align(
                                alignment: Alignment.centerLeft,
                                child: TextButton(
                                  onPressed: () =>
                                      _restituisciPrestito(context, doc),
                                  child: const Text('Restituisci'),
                                ),
                              ),
                          ],
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
