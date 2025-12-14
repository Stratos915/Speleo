insert into notifications (audience, target_role, type, title, message, link)
values
  ('admin', 'admin', 'warning', 'Uscite senza responsabile', 'Ci sono due uscite imminenti senza responsabile. Vai alla pagina Uscite per assegnarne uno.', '/uscite'),
  ('admin', 'magazziniere', 'danger', 'Prestiti materiali scaduti', 'Sono presenti 3 prestiti materiali oltre la data di rientro. Controlla il modulo Prestiti.', '/prestito-avanzato'),
  ('user', null, 'info', 'Libro da restituire', 'Ricordati di riportare il libro “Manuale CAI” in biblioteca entro il 15/03.', '/biblioteca');
