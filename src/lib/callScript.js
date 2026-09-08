export const conversationNodes = {
    start: {
        title: 'Otwarcie rozmowy',
        script: 'Dzień dobry, [IMIĘ] z Oqla. Czy rozmawiam z osobą, która zajmuje się u Państwa rozwojem klubu?',
        note: 'Cel: szybko dotrzeć do osoby decyzyjnej.',
        buttons: [
            { label: 'Tak', next: 'intro', tone: 'primary' },
            { label: 'Nie — sekretariat', next: 'secretary' },
            { label: 'Nie teraz / nie ma czasu', next: 'busy' },
        ],
    },
    secretary: {
        title: 'Sekretariat / recepcja',
        script: 'Rozumiem. Dzwonię w sprawie rozwiązania dla klubów padlowych — automatycznego nagrywania meczów i udostępniania nagrań zawodnikom. Z kim najlepiej mógłbym porozmawiać na ten temat — z właścicielem klubu czy osobą odpowiedzialną za jego rozwój?',
        buttons: [
            { label: 'Podaje osobę / przełącza', next: 'intro', tone: 'primary' },
            { label: 'Nie chce przekierować', next: 'send' },
            { label: 'Nie wiem / nie ma takiej osoby', next: 'send' },
        ],
    },
    intro: {
        title: '30-sekundowe przedstawienie',
        script: 'Super. Postaram się dosłownie w 30 sekund. Tworzymy system do automatycznego nagrywania meczów padla. Kamera na korcie nagrywa mecz, a zawodnicy mogą później dostać swoje nagranie i highlightsy bez angażowania obsługi klubu. Czy macie obecnie coś podobnego?',
        buttons: [
            { label: 'Tak, mamy rozwiązanie', next: 'existing' },
            { label: 'Nie, nie mamy', next: 'none' },
            { label: 'Nie wiem', next: 'none' },
            { label: 'Klient pyta, jak działa', next: 'how' },
        ],
    },
    none: {
        title: 'Brak podobnego rozwiązania',
        script: 'Rozumiem. A czy w ogóle rozważali Państwo kiedyś takie rozwiązanie, czy to raczej temat, który do tej pory Państwa nie interesował?',
        buttons: [
            { label: 'Tak, rozważaliśmy', next: 'demo' },
            { label: 'Nie, ale brzmi ciekawie', next: 'demo' },
            { label: 'Nie, nie widzę potrzeby', next: 'no' },
            { label: 'Proszę wysłać informacje', next: 'send' },
        ],
    },
    existing: {
        title: 'Mają już rozwiązanie',
        script: 'Jasne. A mogę zapytać, z czego Państwo korzystają?',
        buttons: [
            { label: 'Podaje nazwę / odpowiada', next: 'existing2' },
            { label: 'Nie chce powiedzieć', next: 'demo' },
            { label: 'Klient pyta o Oqla', next: 'how' },
        ],
    },
    existing2: {
        title: 'Diagnoza obecnego rozwiązania',
        script: 'Rozumiem. I są Państwo z tego rozwiązania zadowoleni?',
        buttons: [
            { label: 'Tak, jesteśmy zadowoleni', next: 'no' },
            { label: 'Nie / są problemy', next: 'demo' },
            { label: 'Tak sobie', next: 'demo' },
            { label: 'Chce wiedzieć, czym różni się Oqla', next: 'how' },
        ],
    },
    how: {
        title: 'Jak działa Oqla?',
        script: 'W skrócie — montujemy kamerę przy korcie, system cały czas nagrywa, a zawodnik może rozpocząć nagranie swojego meczu przez QR kod. Później dostaje nagranie i może je obejrzeć oraz udostępnić. Najlepiej jednak pokazać to w praktyce.',
        buttons: [
            { label: 'Umów demo', next: 'demo', tone: 'green' },
            { label: 'Pyta o cenę', next: 'price' },
            { label: 'Pyta o montaż', next: 'installation' },
            { label: 'Pyta o szczegóły', next: 'details' },
        ],
    },
    price: {
        title: 'Cena',
        script: 'Przy jednym korcie jest to 300 zł miesięcznie, przy większej liczbie kortów cena za kamerę spada. Do tego dochodzi jednorazowy koszt instalacji. Mogę też pokazać dokładnie, co klub dostaje w ramach systemu.',
        buttons: [
            { label: 'OK — umów demo', next: 'demo', tone: 'green' },
            { label: 'To drogo', next: 'expensive' },
            { label: 'Proszę wysłać ofertę', next: 'send' },
        ],
    },
    expensive: {
        title: '„To drogo”',
        script: 'Rozumiem. A z czym Pan/Pani porównuje tę kwotę — z innymi systemami tego typu czy bardziej z tym, że nie wiadomo jeszcze, czy zawodnicy będą z tego korzystać?',
        buttons: [
            { label: 'Nie widzę jeszcze wartości', next: 'demo' },
            { label: 'Porównuję z innym systemem', next: 'existing' },
            { label: 'Po prostu za drogo', next: 'no' },
        ],
    },
    installation: {
        title: 'Montaż',
        script: 'Instalujemy kamerę przy korcie i konfigurujemy cały system. Chodzi o to, żeby po wdrożeniu obsługa klubu nie musiała zajmować się techniczną stroną nagrywania.',
        buttons: [
            { label: 'OK — demo', next: 'demo', tone: 'green' },
            { label: 'Pyta o koszt montażu', next: 'price' },
            { label: 'Inne pytanie', next: 'details' },
        ],
    },
    details: {
        title: 'Szczegóły',
        script: 'Jasne. Najlepiej będzie, jeśli pokażę to na krótkim demo — wtedy zobaczy Pan/Pani system od strony klubu i zawodnika, zamiast omawiać wszystko przez telefon.',
        buttons: [
            { label: 'Umów demo', next: 'demo', tone: 'green' },
            { label: 'Proszę wysłać maila', next: 'send' },
        ],
    },
    demo: {
        title: 'Umówienie demo',
        script: 'Myślę, że warto to po prostu zobaczyć. Mogę zrobić krótkie, 15-minutowe demo online — pokażę system, jak wygląda od strony klubu i zawodnika oraz jak wygląda wdrożenie. Bardziej pasowałby Panu/Pani [DZIEŃ] czy [DZIEŃ]?',
        buttons: [
            { label: 'Tak — ustalamy termin', next: 'success', tone: 'green' },
            { label: 'Wyślij najpierw maila', next: 'send' },
            { label: 'Nie teraz', next: 'callback' },
        ],
    },
    send: {
        title: 'Wyślij informacje',
        script: 'Jasne, oczywiście. Podeślę krótką informację. Na jaki adres najlepiej wysłać materiały?',
        buttons: [
            { label: 'Podaje e-mail', next: 'followup', tone: 'green' },
            { label: 'Nie chce podać', next: 'no' },
        ],
    },
    followup: {
        title: 'Mail + follow-up',
        script: 'Super, wyślę dzisiaj. Żeby nie zabierać więcej czasu — pozwolę sobie wrócić do Pana/Pani w przyszłym tygodniu i zapytać, czy temat jest interesujący.',
        buttons: [
            { label: 'Ustal termin follow-up', next: 'success', tone: 'green' },
            { label: 'Kończymy rozmowę', next: 'end' },
        ],
    },
    callback: {
        title: 'Oddzwonić później',
        script: 'Jasne, rozumiem. Kiedy będzie wygodniej, żebym oddzwonił — jutro czy np. w przyszłym tygodniu?',
        buttons: [
            { label: 'Ustalamy termin', next: 'success', tone: 'green' },
            { label: 'Nie chce ustalać', next: 'end' },
        ],
    },
    busy: {
        title: 'Klient nie ma czasu',
        script: 'Jasne, rozumiem. Tylko jedno pytanie — czy temat automatycznego nagrywania meczów i udostępniania ich zawodnikom jest w ogóle czymś, co może być dla Państwa interesujące?',
        buttons: [
            { label: 'Tak', next: 'demo', tone: 'green' },
            { label: 'Nie', next: 'no' },
            { label: 'Oddzwonić później', next: 'callback' },
        ],
    },
    no: {
        title: 'Brak zainteresowania',
        script: 'Jasne, rozumiem. Dziękuję za jasną odpowiedź i za poświęcony czas. Życzę udanego dnia, do widzenia.',
        buttons: [{ label: 'Zakończ rozmowę', next: 'end', tone: 'red' }],
    },
    success: {
        title: 'Cel osiągnięty',
        script: 'Świetnie. Zapisz termin spotkania i wyślij ewentualne materiały. Na demo skup się na pokazaniu wartości dla klubu, nie na długiej prezentacji funkcji.',
        buttons: [{ label: 'Nowa rozmowa', next: 'start', tone: 'primary' }],
    },
    end: {
        title: 'Rozmowa zakończona',
        script: 'Zapisz wynik rozmowy, zanim zadzwonisz do kolejnego klubu.',
        buttons: [{ label: 'Nowa rozmowa', next: 'start', tone: 'primary' }],
    },
};
