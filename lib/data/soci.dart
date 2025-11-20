const Map<String, String> sociByTessera = {
  '1': 'GSU',
  '2': 'Lorenzo Zanarelli',
  '3': 'Ivan Campagna',
  '4': 'Nicola Amadori',
  '5': 'Filippo Felici',
  '6': 'Alberto Gaudio',
  '7': 'Manlio Magnoni',
  '8': 'Alberto Crinelli',
  '9': 'Enrico Maria Sacchi',
  '10': 'Paolo Giannotti',
  '11': 'Michele Betti',
  '12': 'Michele Magnoni',
  '13': 'Maria Pia Pozzi',
  '14': 'Stratos',
  '15': 'Massimo Vagnini',
  '16': 'Lino Bedini',
  '17': 'Filippo Martelli',
  '18': 'Andreina Magnoni',
  '19': 'Maria Ragno',
  '20': 'Gabriella Bernardini',
  '21': 'Cristina Luminati',
  '22': 'Viki',
  '23': 'Andrea Tamburini',
  '24': 'Agnese Franca',
  '25': 'Ivan Munari',
  '26': 'Alissa Nesci',
  '27': 'Elena Sacchi',
  '28': 'Edoardo Nocciolino',
  '29': 'Luca Sacchi',
  '30': 'Camilla Betti',
  '31': 'Alessandro Marini',
  '32': 'Tatiana Guazzaroni',
  '33': 'Alessandro Saraga',
  '34': 'Luca Silvestrini',
  '35': 'Enrico Orsini',
  '36': 'Marta di Biase',
  '37': 'Flavio Ghiro',
  '38': 'Filippo Venturini',
  '39': 'Jacopo Tamburini',
  '40': 'Valeria Forlani',
  '41': 'Massimo Amadori',
  '42': 'Matteo Giordani',
  '43': 'Michele Pellegrino',
  '44': 'Marco Alessandrini',
  '45': 'Giulia Gallo',
  '46': 'Luca Bardovagni',
  '47': 'Adriana Sortino',
  '48': 'Simone Smacchia',
  '49': 'Valerio Zuffo',
  '50': 'Gabriele Nocciolino',
  '51': 'Paolo Castellani',
  '52': 'Andrea Fumagalli',
  '53': 'Timothy Charlton',
  '54': 'Alexis Nichole Symons',
  '55': 'Telemachos Andrew Manos',
  '56': 'Bethany Dawn Carter',
  '57': 'Victoria Frances Smith',
  '58': 'Stefano Cafarri',
  '59': 'Arianna Bellocchi',
  '60': 'Thomas Sperandio Iacomucci',
  '61': 'Marco Ciaroni',
  '62': 'Giulio Patisso',
  '63': 'Giampaolo Patisso',
  '64': 'Giulia Smacchia',
  '65': 'Daniele Santini',
  '66': 'Maria Vittoria Mari',
  '67': 'Maria Giulia Bernardini',
  '68': 'Anna Canossa',
  '69': 'Michele Grossi',
  '70': 'Megan Necessary',
  '71': 'Ben Dau',
  '72': 'St Peter Cruz',
  '73': 'Tj Tidwell',
  '74': 'Chelsea Daw',
  '75': 'Liliana Wolt',
  '76': 'Walcher De Andrè',
  '77': 'Yee Bien Chuah',
  '78': 'Marco Barbagli',
  '79': 'Paola Pierinami',
  '80': 'Alba Magnoni',
  '81': 'Nikos Papanikolau',
  '82': 'Alexander Rush',
  '83': 'Marta Sanniu',
  '84': 'Marco Fratti',
  '85': 'Alessio Riossi',
};

const Map<String, String> _accentMap = {
  'à': 'a',
  'á': 'a',
  'â': 'a',
  'ä': 'a',
  'ã': 'a',
  'å': 'a',
  'è': 'e',
  'é': 'e',
  'ê': 'e',
  'ë': 'e',
  'ì': 'i',
  'í': 'i',
  'î': 'i',
  'ï': 'i',
  'ò': 'o',
  'ó': 'o',
  'ô': 'o',
  'ö': 'o',
  'õ': 'o',
  'ù': 'u',
  'ú': 'u',
  'û': 'u',
  'ü': 'u',
  'ç': 'c',
  'ñ': 'n',
  'ß': 'ss',
  'œ': 'oe',
  'æ': 'ae',
  'ś': 's',
  'ł': 'l',
  'š': 's',
  'ž': 'z',
};

String normalizeSocioKey(String value) {
  final trimmed = value.trim().toLowerCase();
  final buffer = StringBuffer();
  bool lastWasSpace = false;
  for (final rune in trimmed.runes) {
    var char = String.fromCharCode(rune);
    char = _accentMap[char] ?? char;
    final isAlphaNum =
        (char.codeUnitAt(0) >= 'a'.codeUnitAt(0) &&
            char.codeUnitAt(0) <= 'z'.codeUnitAt(0)) ||
        (char.codeUnitAt(0) >= '0'.codeUnitAt(0) &&
            char.codeUnitAt(0) <= '9'.codeUnitAt(0));
    if (isAlphaNum) {
      buffer.write(char);
      lastWasSpace = false;
    } else {
      if (!lastWasSpace) {
        buffer.write(' ');
        lastWasSpace = true;
      }
    }
  }
  return buffer.toString().trim();
}

final Map<String, String> sociByNomeNormalized = {
  for (final entry in sociByTessera.entries)
    normalizeSocioKey(entry.value): entry.key,
};

class SocioInfo {
  final String tessera;
  final String nome;

  const SocioInfo({required this.tessera, required this.nome});
}

SocioInfo? findSocio(String input) {
  final trimmed = input.trim();
  if (trimmed.isEmpty) return null;
  final nome = sociByTessera[trimmed];
  if (nome != null) {
    return SocioInfo(tessera: trimmed, nome: nome);
  }

  final normalized = normalizeSocioKey(trimmed);
  final tesseraFromName = sociByNomeNormalized[normalized];
  if (tesseraFromName != null) {
    return SocioInfo(
      tessera: tesseraFromName,
      nome: sociByTessera[tesseraFromName]!,
    );
  }

  return null;
}
