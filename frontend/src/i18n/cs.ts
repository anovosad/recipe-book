import type { Dictionary, Phrase } from './index';

// Czech has four plural categories where English has two - 1 recept,
// 2 recepty, 1,5 receptu, 5 receptů - and Intl.PluralRules picks between them.
export const cs: Dictionary = {
  // Navigation
  'nav.recipes': 'Recepty',
  'nav.ingredients': 'Suroviny',
  'nav.tags': 'Štítky',
  'nav.login': 'Přihlásit',
  'nav.register': 'Registrace',
  'nav.logout': 'Odhlásit',
  'nav.changePassword': 'Změnit heslo',
  'nav.toggleMenu': 'Menu',
  'nav.language': 'Jazyk',

  // Shared
  'common.cancel': 'Zrušit',
  'common.edit': 'Upravit',
  'common.delete': 'Smazat',
  'common.clear': 'Zrušit filtry',
  'common.close': 'Zavřít',
  'common.reset': 'Původní',
  'common.by': 'od {author}',
  'common.notSpecified': '—',
  'common.somethingWrong': 'Něco se pokazilo',
  'common.tryAgain': 'Zkusit znovu',
  'common.goHome': 'Na úvod',
  'common.errorDetails': 'Podrobnosti chyby (vývoj)',
  'common.unexpectedError': 'Narazili jsme na neočekávanou chybu. Byla zaznamenána.',

  'time.minutes': {
    one: '{count} minuta', few: '{count} minuty', many: '{count} minuty', other: '{count} minut'
  } as Phrase,
  'time.hours': {
    one: '{count} hodina', few: '{count} hodiny', many: '{count} hodiny', other: '{count} hodin'
  } as Phrase,
  'time.hoursMinutes': '{hours} {minutes}',

  // Recipe list
  'recipes.title': 'Recepty',
  'recipes.countPlain': {
    one: '{count} recept ve sbírce',
    few: '{count} recepty ve sbírce',
    many: '{count} receptu ve sbírce',
    other: '{count} receptů ve sbírce'
  } as Phrase,
  'recipes.countFiltered': {
    one: '{count} recept odpovídá filtrům',
    few: '{count} recepty odpovídají filtrům',
    many: '{count} receptu odpovídá filtrům',
    other: '{count} receptů odpovídá filtrům'
  } as Phrase,
  'recipes.withAllIngredients': '— obsahují všech {count} surovin',
  'recipes.add': 'Přidat recept',
  'recipes.addFirst': 'Přidejte svůj první recept',
  'recipes.searchPlaceholder': 'Hledat recepty, suroviny nebo štítky…',
  'recipes.searchLabel': 'Hledat recepty',
  'recipes.filterTags': 'Štítky',
  'recipes.filterIngredients': 'Suroviny',
  'recipes.filterIngredientsHint': 'Vyberte kolik chcete — recept musí obsahovat <strong>všechny</strong> z nich.',
  'recipes.ingredientSearchPlaceholder': 'Najít surovinu…',
  'recipes.ingredientSearchLabel': 'Filtrovat seznam surovin',
  'recipes.noIngredientsAnywhere': 'Zatím žádný recept neuvádí suroviny.',
  'recipes.noIngredientMatch': 'Nic neodpovídá „{query}“.',
  'recipes.filteredBy': 'Filtrováno podle',
  'recipes.removeTagFilter': 'Zrušit filtr štítku {name}',
  'recipes.removeIngredientFilter': 'Odebrat {name}',
  'recipes.emptyTitle': 'Žádné recepty',
  'recipes.emptyFiltered': 'Zadaným filtrům neodpovídá žádný recept. Zkuste upravit hledání nebo zrušit štítky.',
  'recipes.emptyAuthed': 'Přidejte první recept!',
  'recipes.emptyAnon': 'Pro přidávání receptů se přihlaste.',
  'recipes.deleteConfirm': 'Smazat „{title}“?',
  'recipes.deleted': 'Recept smazán',
  'recipes.deleteFailed': 'Recept se nepodařilo smazat. Zkuste to prosím znovu.',
  'recipes.morePhotos': '+{count}',

  // Recipe detail
  'recipe.back': 'Zpět na recepty',
  'recipe.created': 'Vytvořeno {date}',
  'recipe.prepTime': 'Příprava',
  'recipe.cookTime': 'Vaření',
  'recipe.servings': 'Porce',
  'recipe.totalTime': 'Celkem',
  'recipe.ingredients': 'Suroviny',
  'recipe.instructions': 'Postup',
  'recipe.noIngredients': 'Žádné suroviny',
  'recipe.scaledNote': 'Přepočítáno na {servings} (×{ratio} oproti původnímu)',
  'recipe.decreaseServings': 'Méně porcí',
  'recipe.increaseServings': 'Více porcí',
  'recipe.notFound': 'Recept nenalezen',
  'recipe.notFoundBody': 'Hledaný recept neexistuje nebo byl odstraněn.',
  'recipe.deleteConfirm': 'Smazat „{title}“? Tuto akci nelze vrátit.',
  'recipe.prepPlusCook': 'Příprava + vaření',

  // Photo gallery
  'gallery.openFullSize': 'Otevřít v plné velikosti',
  'gallery.showPhoto': 'Zobrazit fotku {number}',
  'gallery.photo': 'Fotka {number}',
  'gallery.zoomIn': 'Přiblížit',
  'gallery.zoomOut': 'Oddálit',
  'gallery.rotate': 'Otočit',
  'gallery.previous': 'Předchozí fotka',
  'gallery.next': 'Další fotka',
  'gallery.shortcuts': '← → procházení · + − přiblížení · R otočení · Esc zavřít',

  // Recipe form
  'form.createTitle': 'Nový recept',
  'form.editTitle': 'Upravit recept',
  'form.editing': 'Upravujete: {title}',
  'form.back': 'Zpět',
  'form.basics': 'Základní údaje',
  'form.title': 'Název receptu',
  'form.titlePlaceholder': 'Výstižný název jídla',
  'form.description': 'Popis',
  'form.descriptionPlaceholder': 'Věta nebo dvě (nepovinné)',
  'form.details': 'Podrobnosti',
  'form.prepTime': 'Příprava (minuty)',
  'form.cookTime': 'Vaření (minuty)',
  'form.servings': 'Počet porcí',
  'form.servingUnit': 'Jednotka porce',
  'form.ingredients': 'Suroviny',
  'form.addNewIngredient': 'Nová surovina',
  'form.addIngredientRow': 'Přidat surovinu',
  'form.ingredient': 'Surovina',
  'form.selectIngredient': 'Vyberte surovinu…',
  'form.quantity': 'Množství',
  'form.unit': 'Jednotka',
  'form.selectUnit': 'Vyberte jednotku…',
  'form.tags': 'Kategorie a štítky',
  'form.addNewTag': 'Nový štítek',
  'form.tagsHint': 'Kliknutím štítek přidáte nebo odeberete.',
  'form.images': 'Fotky',
  'form.addImages': 'Přidat fotky',
  'form.imagesHelp': 'Až 5 fotek. JPG, PNG, GIF nebo WebP, každá nejvýše 5 MB.',
  'form.pendingUploadEdit': 'Připraveno k nahrání. Označte tu, která má nahradit současnou náhledovou.',
  'form.pendingUploadNew': 'Připraveno k nahrání. Označte, která má být náhledová — jinak se použije první.',
  'form.currentImages': 'Současné fotky',
  'form.coverExplainer': 'Náhledová fotka se zobrazuje v seznamu receptů a v záhlaví receptu.',
  'form.cover': 'Náhledová',
  'form.setCover': 'Nastavit jako náhledovou',
  'form.coverWillBe': 'Tato bude náhledová',
  'form.coverUpdated': 'Náhledová fotka změněna',
  'form.coverFailed': 'Náhledovou fotku se nepodařilo nastavit',
  'form.deleteImage': 'Smazat fotku',
  'form.imageDeleted': 'Fotka smazána',
  'form.imageDeleteFailed': 'Fotku se nepodařilo smazat',
  'form.instructions': 'Postup',
  'form.instructionsPlaceholder': 'Krok za krokem. Kroky číslujte, každý dostane vlastní řádek.',
  'form.create': 'Vytvořit recept',
  'form.update': 'Uložit změny',
  'form.creating': 'Vytvářím…',
  'form.updating': 'Ukládám…',
  'form.created': 'Recept vytvořen',
  'form.updated': 'Recept uložen',
  'form.imagesUploaded': 'Nahráno fotek: {count}.',
  'form.imagesFailed': 'Recept byl uložen, ale některé fotky se nepodařilo nahrát',
  'form.needIngredient': 'Přidejte alespoň jednu surovinu',
  'form.loadFailed': 'Formulář se nepodařilo načíst',
  'form.newIngredientName': 'Název suroviny',
  'form.newIngredientPlaceholder': 'např. Olivový olej, Kuřecí prsa',
  'form.newTagName': 'Název štítku',
  'form.newTagPlaceholder': 'např. Dezert, Rychlé a snadné',
  'form.tagColor': 'Barva',
  'form.preview': 'Náhled',

  // Validation
  'valid.titleRequired': 'Název je povinný',
  'valid.titleTooLong': 'Nejvýše 200 znaků',
  'valid.descriptionTooLong': 'Nejvýše 1000 znaků',
  'valid.instructionsRequired': 'Postup je povinný',
  'valid.instructionsTooLong': 'Nejvýše 10 000 znaků',
  'valid.timeNegative': 'Nesmí být záporné',
  'valid.timeTooLong': 'Nejvýše 24 hodin',
  'valid.servingsRequired': 'Počet porcí je povinný',
  'valid.servingsMin': 'Alespoň 1',
  'valid.servingsMax': 'Nejvýše 100',
  'valid.ingredientRequired': 'Vyberte surovinu',
  'valid.quantityRequired': 'Množství je povinné',
  'valid.quantityMin': 'Musí být větší než 0',
  'valid.quantityMax': 'To je příliš mnoho',
  'valid.unitRequired': 'Vyberte jednotku',

  // Ingredients page
  'ingredients.title': 'Suroviny',
  'ingredients.count': {
    one: '{count} surovina ve spíži',
    few: '{count} suroviny ve spíži',
    many: '{count} suroviny ve spíži',
    other: '{count} surovin ve spíži'
  } as Phrase,
  'ingredients.add': 'Přidat surovinu',
  'ingredients.addFirst': 'Přidejte svou první surovinu',
  'ingredients.searchPlaceholder': 'Hledat suroviny…',
  'ingredients.emptyTitle': 'Žádné suroviny',
  'ingredients.emptySearch': 'Nic neodpovídá „{query}“. Zkuste hledat jinak.',
  'ingredients.emptyAuthed': 'Přidejte pár surovin a můžeme začít.',
  'ingredients.emptyAnon': 'Pro správu surovin se přihlaste.',
  'ingredients.newTitle': 'Nová surovina',
  'ingredients.namePlaceholder': 'např. Olivový olej, Kuřecí prsa, Bazalka',
  'ingredients.exists': 'Taková surovina už existuje',
  'ingredients.nameRequired': 'Název je povinný',
  'ingredients.added': 'Surovina přidána',
  'ingredients.addFailed': 'Surovinu se nepodařilo přidat',
  'ingredients.deleteConfirm': 'Smazat „{name}“?',
  'ingredients.deleted': 'Surovina smazána',
  'ingredients.deleteFailed': 'Surovinu se nepodařilo smazat',
  'ingredients.findRecipes': 'Najít recepty se surovinou {name}',
  'ingredients.deleteLabel': 'Smazat surovinu {name}',
  'ingredients.loadFailed': 'Suroviny se nepodařilo načíst',

  // Tags page
  'tags.title': 'Štítky',
  'tags.count': {
    one: '{count} štítek pro řazení sbírky',
    few: '{count} štítky pro řazení sbírky',
    many: '{count} štítku pro řazení sbírky',
    other: '{count} štítků pro řazení sbírky'
  } as Phrase,
  'tags.add': 'Přidat štítek',
  'tags.addFirst': 'Přidejte svůj první štítek',
  'tags.searchPlaceholder': 'Hledat štítky…',
  'tags.emptyTitle': 'Žádné štítky',
  'tags.emptySearch': 'Nic neodpovídá „{query}“. Zkuste hledat jinak.',
  'tags.emptyAuthed': 'Přidejte štítky a uspořádejte si recepty.',
  'tags.emptyAnon': 'Pro správu štítků se přihlaste.',
  'tags.newTitle': 'Nový štítek',
  'tags.namePlaceholder': 'např. Dezert, Rychlé a snadné, Vegetariánské',
  'tags.exists': 'Takový štítek už existuje',
  'tags.nameRequired': 'Název je povinný',
  'tags.added': 'Štítek přidán',
  'tags.addFailed': 'Štítek se nepodařilo přidat',
  'tags.deleteConfirm': 'Smazat „{name}“? Odebere se ze všech vašich receptů.',
  'tags.deleted': 'Štítek smazán',
  'tags.deleteFailed': 'Štítek se nepodařilo smazat',
  'tags.viewRecipes': 'Zobrazit recepty se štítkem {name}',
  'tags.deleteLabel': 'Smazat štítek {name}',
  'tags.loadFailed': 'Štítky se nepodařilo načíst',
  'tags.useColour': 'Použít barvu {colour}',

  // Auth
  'auth.welcomeBack': 'Vítejte zpět',
  'auth.signInSubtitle': 'Přihlaste se ke svému účtu',
  'auth.username': 'Uživatelské jméno',
  'auth.usernamePlaceholder': 'Vaše uživatelské jméno',
  'auth.password': 'Heslo',
  'auth.passwordPlaceholder': 'Vaše heslo',
  'auth.signIn': 'Přihlásit se',
  'auth.signingIn': 'Přihlašuji…',
  'auth.noAccount': 'Nemáte účet?',
  'auth.createOne': 'Vytvořte si ho',
  'auth.createAccount': 'Vytvořit účet',
  'auth.registerSubtitle': 'Založte si účet a ukládejte si recepty',
  'auth.email': 'E-mail',
  'auth.emailPlaceholder': 'vy@example.com',
  'auth.confirmPassword': 'Heslo znovu',
  'auth.register': 'Registrovat',
  'auth.registering': 'Vytvářím…',
  'auth.haveAccount': 'Už máte účet?',
  'auth.signInInstead': 'Přihlaste se',
  'auth.usernameRequired': 'Uživatelské jméno je povinné',
  'auth.usernameShort': 'Alespoň 3 znaky',
  'auth.usernameLong': 'Nejvýše 30 znaků',
  'auth.usernameChars': 'Pouze písmena bez diakritiky, číslice a podtržítko',
  'auth.emailRequired': 'E-mail je povinný',
  'auth.emailInvalid': 'Tohle nevypadá jako e-mailová adresa',
  'auth.passwordRequired': 'Heslo je povinné',
  'auth.passwordShort': 'Alespoň 6 znaků',
  'auth.passwordsDiffer': 'Hesla se neshodují',
  'auth.sessionExpired': 'Platnost přihlášení vypršela. Přihlaste se prosím znovu.',
  'auth.loggedOut': 'Odhlášeno',
  'auth.changePassword': 'Změna hesla',
  'auth.currentPassword': 'Současné heslo',
  'auth.newPassword': 'Nové heslo',
  'auth.repeatNewPassword': 'Nové heslo znovu',
  'auth.passwordRules': 'Alespoň 6 znaků, musí obsahovat písmeno a číslici.',
  'auth.changePasswordNote': 'Změnou hesla se odhlásí všechna ostatní zařízení. Toto zůstane přihlášené.',
  'auth.changePasswordFailed': 'Heslo se nepodařilo změnit',

  // Serving units, four forms each - see the English file.
  'unit.people': {
    one: '{count} osoba', few: '{count} osoby', many: '{count} osoby', other: '{count} osob'
  } as Phrase,
  'unit.servings': {
    one: '{count} porce', few: '{count} porce', many: '{count} porce', other: '{count} porcí'
  } as Phrase,
  'unit.portions': {
    one: '{count} porce', few: '{count} porce', many: '{count} porce', other: '{count} porcí'
  } as Phrase,
  'unit.pieces': {
    one: '{count} kus', few: '{count} kusy', many: '{count} kusu', other: '{count} kusů'
  } as Phrase,
  'unit.slices': {
    one: '{count} plátek', few: '{count} plátky', many: '{count} plátku', other: '{count} plátků'
  } as Phrase,
  'unit.cups': {
    one: '{count} hrnek', few: '{count} hrnky', many: '{count} hrnku', other: '{count} hrnků'
  } as Phrase,
  'unit.bowls': {
    one: '{count} miska', few: '{count} misky', many: '{count} misky', other: '{count} misek'
  } as Phrase,
  'unit.glasses': {
    one: '{count} sklenice', few: '{count} sklenice', many: '{count} sklenice', other: '{count} sklenic'
  } as Phrase,
  'unit.liters': {
    one: '{count} litr', few: '{count} litry', many: '{count} litru', other: '{count} litrů'
  } as Phrase,
  'unit.ml': {
    one: '{count} ml', few: '{count} ml', many: '{count} ml', other: '{count} ml'
  } as Phrase,
  'unit.kg': {
    one: '{count} kg', few: '{count} kg', many: '{count} kg', other: '{count} kg'
  } as Phrase,
  'unit.g': {
    one: '{count} g', few: '{count} g', many: '{count} g', other: '{count} g'
  } as Phrase,
  'unit.dozen': {
    one: '{count} tucet', few: '{count} tucty', many: '{count} tuctu', other: '{count} tuctů'
  } as Phrase,
  'unit.cookies': {
    one: '{count} sušenka', few: '{count} sušenky', many: '{count} sušenky', other: '{count} sušenek'
  } as Phrase,
  'unit.muffins': {
    one: '{count} muffin', few: '{count} muffiny', many: '{count} muffinu', other: '{count} muffinů'
  } as Phrase,
  'unit.pancakes': {
    one: '{count} lívanec', few: '{count} lívance', many: '{count} lívance', other: '{count} lívanců'
  } as Phrase,

  'common.rename': 'Přejmenovat',
  'common.save': 'Uložit',
  'ingredients.renameTitle': 'Přejmenovat surovinu',
  'ingredients.renamed': 'Surovina přejmenována',
  'ingredients.renameFailed': 'Surovinu se nepodařilo přejmenovat',
  'ingredients.renameLabel': 'Přejmenovat {name}',
  'ingredients.renameNote': 'Změna se projeví ve všech receptech, které ji používají.',
  'tags.renameTitle': 'Přejmenovat štítek',
  'tags.renamed': 'Štítek přejmenován',
  'tags.renameFailed': 'Štítek se nepodařilo přejmenovat',
  'tags.renameLabel': 'Přejmenovat {name}',
  'tags.renameNote': 'Změna se projeví ve všech receptech, které jej nesou.',

  // Measurement units - see the English file for what each group is for.
  'measure.tsp': {
    one: 'lžička', few: 'lžičky', many: 'lžičky', other: 'lžiček'
  } as Phrase,
  'measure.tbsp': {
    one: 'lžíce', few: 'lžíce', many: 'lžíce', other: 'lžic'
  } as Phrase,
  'measure.cup': {
    one: 'hrnek', few: 'hrnky', many: 'hrnku', other: 'hrnků'
  } as Phrase,
  'measure.ml': {
    one: 'ml', few: 'ml', many: 'ml', other: 'ml'
  } as Phrase,
  'measure.l': {
    one: 'l', few: 'l', many: 'l', other: 'l'
  } as Phrase,
  'measure.fl oz': {
    one: 'fl oz', few: 'fl oz', many: 'fl oz', other: 'fl oz'
  } as Phrase,
  'measure.g': {
    one: 'g', few: 'g', many: 'g', other: 'g'
  } as Phrase,
  'measure.kg': {
    one: 'kg', few: 'kg', many: 'kg', other: 'kg'
  } as Phrase,
  'measure.oz': {
    one: 'oz', few: 'oz', many: 'oz', other: 'oz'
  } as Phrase,
  'measure.lb': {
    one: 'lb', few: 'lb', many: 'lb', other: 'lb'
  } as Phrase,
  'measure.piece': {
    one: 'kus', few: 'kusy', many: 'kusu', other: 'kusů'
  } as Phrase,
  'measure.clove': {
    one: 'stroužek', few: 'stroužky', many: 'stroužku', other: 'stroužků'
  } as Phrase,
  'measure.slice': {
    one: 'plátek', few: 'plátky', many: 'plátku', other: 'plátků'
  } as Phrase,
  'measure.can': {
    one: 'konzerva', few: 'konzervy', many: 'konzervy', other: 'konzerv'
  } as Phrase,
  'measure.package': {
    one: 'balení', few: 'balení', many: 'balení', other: 'balení'
  } as Phrase,
  'measure.pinch': {
    one: 'špetka', few: 'špetky', many: 'špetky', other: 'špetek'
  } as Phrase,
  'measure.dash': {
    one: 'kapka', few: 'kapky', many: 'kapky', other: 'kapek'
  } as Phrase,
  'measure.to taste': {
    one: 'dle chuti', few: 'dle chuti', many: 'dle chuti', other: 'dle chuti'
  } as Phrase,
  'measureLabel.tsp': 'Lžička',
  'measureLabel.tbsp': 'Lžíce',
  'measureLabel.cup': 'Hrnek',
  'measureLabel.ml': 'Mililitr',
  'measureLabel.l': 'Litr',
  'measureLabel.fl oz': 'Tekutá unce',
  'measureLabel.g': 'Gram',
  'measureLabel.kg': 'Kilogram',
  'measureLabel.oz': 'Unce',
  'measureLabel.lb': 'Libra',
  'measureLabel.piece': 'Kus',
  'measureLabel.clove': 'Stroužek',
  'measureLabel.slice': 'Plátek',
  'measureLabel.can': 'Konzerva',
  'measureLabel.package': 'Balení',
  'measureLabel.pinch': 'Špetka',
  'measureLabel.dash': 'Kapka',
  'measureLabel.to taste': 'Dle chuti',
  'measureCategory.Volume': 'Objem',
  'measureCategory.Weight': 'Hmotnost',
  'measureCategory.Count': 'Počet',
  'measureCategory.Other': 'Ostatní',
  'servingLabel.people': 'Osoby',
  'servingLabel.servings': 'Porce',
  'servingLabel.portions': 'Porce',
  'servingLabel.pieces': 'Kusy',
  'servingLabel.slices': 'Plátky',
  'servingLabel.cups': 'Hrnky',
  'servingLabel.bowls': 'Misky',
  'servingLabel.glasses': 'Sklenice',
  'servingLabel.liters': 'Litry',
  'servingLabel.ml': 'Mililitry',
  'servingLabel.kg': 'Kilogramy',
  'servingLabel.g': 'Gramy',
  'servingLabel.dozen': 'Tucet',
  'servingLabel.cookies': 'Sušenky',
  'servingLabel.muffins': 'Muffiny',
  'servingLabel.pancakes': 'Lívance',

  // Network-level, raised by the axios interceptor rather than by a page
  'net.timeout': 'Požadavek vypršel. Zkuste to prosím znovu.',
  'net.rateLimited': 'Příliš mnoho požadavků. Zpomalte prosím.',
  'net.serverError': 'Chyba serveru. Zkuste to prosím později.',
  'net.offline': 'Chyba sítě. Zkontrolujte připojení.',

  // 404
  'notFound.title': 'Recept nenalezen',
  'notFound.body': 'Vypadá to, že hledanou stránku někdo snědl.',
  'notFound.goToRecipes': 'Na recepty',
  'notFound.goBack': 'Zpět'
};
