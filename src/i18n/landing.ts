// Landing-page strings, kept apart from the application catalogue on purpose.
//
// `/` is a marketing page. It shares the design tokens and the two preferences
// with /builder and /networks, but it must not pull their ~430-key dictionary
// (or React) across the wire to render ten paragraphs of prose. So it carries
// its own small catalogue, in the same seven locales, resolved with the same
// `lang` key -- the same split the pre-rewrite landing page made, for the same
// reason.
//
// English is the shape every other locale is checked against by the compiler,
// exactly as ids.ts does it for the application catalogue.

export const en = {
  heroTagline: 'OpenWrt · Browser-built · Zero SSH',
  heroTitleA: 'Flash once.',
  heroTitleB: "Everything's already set up.",
  heroSubtitle:
    'Build a fully-configured OpenWrt image — VLANs, WiFi, VPN, ad-blocking — in your browser.',
  singleNodeBuilder: 'Single-node builder →',
  multiNodeFleetBuilder: 'Multi-node fleet builder →',
  fleetBuilderLink: 'Fleet builder →',
  viewSourceGithub: 'View source on GitHub ↗',

  secretsTitle: 'WrtNova never sees your secrets',
  secretsText:
    'Root password, WiFi passphrases, WireGuard keys, API tokens: the whole image is assembled in your browser and sent straight to the OpenWrt build server you choose. None of it passes through a WrtNova backend.',

  statSsh: 'SSH sessions',
  statLuci: 'LuCI clicks',
  statSecrets: 'Secrets sent to us',
  statFlash: 'Flash',

  featuresHeading: 'What first boot configures',
  featureVlansTitle: 'VLANs without learning VLANs',
  featureVlansDesc:
    'Segment into LAN, Guest, and IoT zones. WrtNova detects your switch hardware and wires the tagging correctly — no DSA-vs-swconfig rabbit hole.',
  featureRoamTitle: 'Roaming tuned out of the box',
  featureRoamDesc:
    'Every SSID ships with 802.11k/v/r fast transition and usteer band steering, thresholds pre-tuned. IoT stays on plain 2.4 GHz so older devices never meet 11r/k/v quirks.',
  featureMeshTitle: 'Mesh backhaul, VLANs included',
  featureMeshDesc:
    '802.11s mesh with SAE encryption and tuned peering, optional batman-adv on top. All VLANs are trunked over the mesh link, so guest stays guest on every node.',
  featureVpnTitle: 'VPN built in — or one click to WARP',
  featureVpnDesc:
    'Route through your own WireGuard VPN provider, or prefill a free Cloudflare WARP config in one click. It gets its own network and SSID automatically.',
  featureMultiwanTitle: 'Failover that is already wired',
  featureMultiwanDesc:
    'Second WAN, LTE modem, or a phone on USB. mwan3 arrives configured: health-tracked failover, load balancing, sticky HTTPS sessions.',
  featurePrivacyTitle: 'Private and ad-free out of the box',
  featurePrivacyDesc:
    'Network-wide ad blocking and encrypted DNS. AdGuard Home on capable hardware, a lightweight fallback on smaller routers.',
  featureForwardTitle: 'Port forwards as one-liners',
  featureForwardDesc:
    'One line per host creates the static lease and its WAN port forwards together, named in the firewall. The reservation and the redirect can never drift apart.',
  featureIpv6Title: 'IPv6 servers, no NAT hacks',
  featureIpv6Desc:
    'Each host gets a stable ::N address that survives prefix changes, its own Cloudflare DDNS subdomain, and a firewall accept scoped to exactly the ports you list.',
  featureFleetTitle: 'One config, a whole fleet',
  featureFleetDesc:
    'Flash the same image with AP_MODE=1 and it becomes an access point and managed switch: same SSIDs, same VLANs, clients roam between nodes. The fleet builder builds router and APs in one session.',
  featureFlashTitle: 'Flash once, fully configured',
  featureFlashDesc:
    'No LuCI menus, no SSH. WrtNova bakes your whole setup into a first-boot script. Flash the image and the router configures itself.',
  featureMoreText:
    'Plus per-network DHCP instances, Cloudflare DDNS, PPPoE, wan-port bridging, NAT offloading, NTP, zram, and more.',

  ctaTagline: 'Your router, your config — baked in from the first boot.',
  footerNotAffiliated: 'Not affiliated with or endorsed by Cloudflare, Inc.',
  footerTrademark: 'Cloudflare and WARP are registered trademarks of their respective owners.',

  themeLabel: 'Theme',
  langLabel: 'Language',
};

export type LandingId = keyof typeof en;

/** What every non-English landing catalogue must satisfy, exhaustively. */
export type LandingCatalog = Record<LandingId, string>;

const de: LandingCatalog = {
  heroTagline: 'OpenWrt · Browser-gebaut · Kein SSH',
  heroTitleA: 'Einmal flashen.',
  heroTitleB: 'Alles ist schon eingerichtet.',
  heroSubtitle:
    'Erstellen Sie ein vollständig konfiguriertes OpenWrt-Image — VLANs, WiFi, VPN, Werbeblocker — direkt im Browser.',
  singleNodeBuilder: 'Einzelknoten-Builder →',
  multiNodeFleetBuilder: 'Multi-Knoten-Fleet-Builder →',
  fleetBuilderLink: 'Fleet-Builder →',
  viewSourceGithub: 'Quellcode auf GitHub ansehen ↗',

  secretsTitle: 'WrtNova sieht Ihre Geheimnisse nie',
  secretsText:
    'Root-Passwort, WLAN-Passphrasen, WireGuard-Schlüssel, API-Token: das gesamte Image wird in Ihrem Browser zusammengestellt und direkt an den von Ihnen gewählten OpenWrt-Build-Server geschickt. Nichts davon läuft über ein WrtNova-Backend.',

  statSsh: 'SSH-Sitzungen',
  statLuci: 'LuCI-Klicks',
  statSecrets: 'An uns gesendete Geheimnisse',
  statFlash: 'Flash-Vorgang',

  featuresHeading: 'Was der erste Start konfiguriert',
  featureVlansTitle: 'VLANs ohne VLAN-Kenntnisse',
  featureVlansDesc:
    'Unterteilen Sie in LAN-, Gast- und IoT-Zonen. WrtNova erkennt Ihre Switch-Hardware und konfiguriert das Tagging korrekt — kein DSA-vs-swconfig-Kaninchenloch.',
  featureRoamTitle: 'Roaming ab Werk abgestimmt',
  featureRoamDesc:
    'Jede SSID kommt mit 802.11k/v/r Fast Transition und usteer Band-Steering, Schwellwerte vorab justiert. IoT bleibt auf reinem 2,4 GHz — Altgeräte sehen nie 11r/k/v-Macken.',
  featureMeshTitle: 'Mesh-Backhaul, VLANs inklusive',
  featureMeshDesc:
    '802.11s-Mesh mit SAE-Verschlüsselung und abgestimmtem Peering, optional batman-adv obendrauf. Alle VLANs werden über den Mesh-Link getrunkt — Gast bleibt Gast auf jedem Knoten.',
  featureVpnTitle: 'VPN integriert — oder ein Klick zu WARP',
  featureVpnDesc:
    'Routen Sie über Ihren eigenen WireGuard-Anbieter, oder füllen Sie eine kostenlose Cloudflare WARP-Konfiguration mit einem Klick vor. Es bekommt automatisch sein eigenes Netzwerk und SSID.',
  featureMultiwanTitle: 'Failover ist schon verdrahtet',
  featureMultiwanDesc:
    'Zweites WAN, LTE-Modem oder ein Handy am USB — mwan3 kommt fertig konfiguriert: Health-Tracking, Lastverteilung, sticky HTTPS-Sitzungen.',
  featurePrivacyTitle: 'Privat und werbefrei von Anfang an',
  featurePrivacyDesc:
    'Netzwerkweite Werbeblocker und verschlüsseltes DNS. AdGuard Home auf leistungsfähiger Hardware, ein leichtgewichtiger Fallback auf kleineren Routern — automatisch gewählt.',
  featureForwardTitle: 'Portweiterleitungen als Einzeiler',
  featureForwardDesc:
    'Eine Zeile pro Host erzeugt statisches Lease und WAN-Weiterleitungen zusammen, benannt in der Firewall. Reservierung und Redirect laufen nie auseinander.',
  featureIpv6Title: 'IPv6-Server ohne NAT-Tricks',
  featureIpv6Desc:
    'Jeder Host bekommt eine stabile ::N-Adresse, die Präfixwechsel übersteht, eine eigene Cloudflare-DDNS-Subdomain und eine Firewall-Freigabe exakt für die gelisteten Ports.',
  featureFleetTitle: 'Eine Config, die ganze Flotte',
  featureFleetDesc:
    'Dasselbe Image mit AP_MODE=1 wird zum Access Point und Managed Switch: gleiche SSIDs, gleiche VLANs, Clients roamen zwischen Knoten. Der Fleet-Builder baut Router und APs in einer Sitzung.',
  featureFlashTitle: 'Einmal flashen, vollständig konfiguriert',
  featureFlashDesc:
    'Keine LuCI-Menüs, kein SSH. WrtNova backt Ihre gesamte Konfiguration in ein Erststart-Skript. Flashen Sie das Image und der Router konfiguriert sich selbst.',
  featureMoreText:
    'Dazu DHCP-Instanzen pro Netz, Cloudflare DDNS, PPPoE, WAN-Port-Bridging, NAT-Offloading, NTP, zram und mehr.',

  ctaTagline: 'Ihr Router, Ihre Konfiguration — von Anfang an eingebaut.',
  footerNotAffiliated: 'Nicht mit Cloudflare, Inc. verbunden oder von ihr unterstützt.',
  footerTrademark: 'Cloudflare und WARP sind eingetragene Marken ihrer jeweiligen Eigentümer.',

  themeLabel: 'Design',
  langLabel: 'Sprache',
};

const es: LandingCatalog = {
  heroTagline: 'OpenWrt · Compilado en el navegador · Sin SSH',
  heroTitleA: 'Flashea una vez.',
  heroTitleB: 'Todo ya está configurado.',
  heroSubtitle:
    'Crea una imagen OpenWrt completamente configurada — VLANs, WiFi, VPN, bloqueo de anuncios — en tu navegador.',
  singleNodeBuilder: 'Compilador de nodo único →',
  multiNodeFleetBuilder: 'Compilador de flota multinodo →',
  fleetBuilderLink: 'Compilador de flota →',
  viewSourceGithub: 'Ver el código fuente en GitHub ↗',

  secretsTitle: 'WrtNova nunca ve tus secretos',
  secretsText:
    'Contraseña de root, claves WiFi, claves WireGuard, tokens de API: la imagen entera se ensambla en tu navegador y se envía directamente al servidor de compilación OpenWrt que elijas. Nada de eso pasa por un backend de WrtNova.',

  statSsh: 'Sesiones SSH',
  statLuci: 'Clics en LuCI',
  statSecrets: 'Secretos enviados a nosotros',
  statFlash: 'Flasheo',

  featuresHeading: 'Qué configura el primer arranque',
  featureVlansTitle: 'VLANs sin aprender sobre VLANs',
  featureVlansDesc:
    'Segmenta en zonas LAN, Invitado e IoT. WrtNova detecta tu hardware de switch y configura el etiquetado correctamente — sin perderte en DSA vs swconfig.',
  featureRoamTitle: 'Roaming afinado de fábrica',
  featureRoamDesc:
    'Cada SSID trae 802.11k/v/r y band steering con usteer, umbrales ya ajustados. IoT se queda en 2,4 GHz puro: los dispositivos antiguos nunca ven las rarezas de 11r/k/v.',
  featureMeshTitle: 'Backhaul mesh con VLANs incluidas',
  featureMeshDesc:
    'Mesh 802.11s con cifrado SAE y peering ajustado, batman-adv opcional encima. Todas las VLANs se trunkan por el enlace mesh: el invitado sigue siendo invitado en cada nodo.',
  featureVpnTitle: 'VPN incorporado — o un clic a WARP',
  featureVpnDesc:
    'Enruta a través de tu propio proveedor WireGuard, o rellena una configuración gratuita de Cloudflare WARP con un clic. Obtendrá su propia red y SSID automáticamente.',
  featureMultiwanTitle: 'Failover ya cableado',
  featureMultiwanDesc:
    'Segundo WAN, módem LTE o un teléfono por USB: mwan3 llega configurado con seguimiento de salud, balanceo de carga y HTTPS persistente.',
  featurePrivacyTitle: 'Privado y sin anuncios desde el primer momento',
  featurePrivacyDesc:
    'Bloqueo de anuncios en toda la red y DNS cifrado. AdGuard Home en hardware potente, una alternativa ligera en routers más pequeños — elegida automáticamente.',
  featureForwardTitle: 'Redirecciones de puertos en una línea',
  featureForwardDesc:
    'Una línea por host crea a la vez la reserva estática y sus redirecciones desde WAN, con nombre en el firewall. La reserva y la redirección nunca se desincronizan.',
  featureIpv6Title: 'Servidores IPv6 sin trucos NAT',
  featureIpv6Desc:
    'Cada host recibe una dirección ::N estable que sobrevive a los cambios de prefijo, su propio subdominio DDNS de Cloudflare y una regla de firewall limitada a los puertos listados.',
  featureFleetTitle: 'Una config, toda la flota',
  featureFleetDesc:
    'La misma imagen con AP_MODE=1 se convierte en punto de acceso y switch gestionado: mismos SSIDs, mismas VLANs, los clientes hacen roaming entre nodos. El fleet builder construye router y APs en una sesión.',
  featureFlashTitle: 'Flashea una vez, completamente configurado',
  featureFlashDesc:
    'Sin menús LuCI, sin SSH. WrtNova integra toda tu configuración en un script de primer arranque. Flashea la imagen y el router se configura solo.',
  featureMoreText:
    'Además: instancias DHCP por red, DDNS de Cloudflare, PPPoE, puente del puerto WAN, NAT offloading, NTP, zram y más.',

  ctaTagline: 'Tu router, tu configuración — integrada desde el primer arranque.',
  footerNotAffiliated: 'No afiliado ni respaldado por Cloudflare, Inc.',
  footerTrademark: 'Cloudflare y WARP son marcas registradas de sus respectivos propietarios.',

  themeLabel: 'Tema',
  langLabel: 'Idioma',
};

const fr: LandingCatalog = {
  heroTagline: 'OpenWrt · Compilé dans le navigateur · Zéro SSH',
  heroTitleA: 'Flashez une fois.',
  heroTitleB: 'Tout est déjà configuré.',
  heroSubtitle:
    'Créez une image OpenWrt entièrement configurée — VLANs, WiFi, VPN, blocage des publicités — dans votre navigateur.',
  singleNodeBuilder: 'Compilateur nœud unique →',
  multiNodeFleetBuilder: 'Compilateur de flotte multi-nœuds →',
  fleetBuilderLink: 'Compilateur de flotte →',
  viewSourceGithub: 'Voir le code source sur GitHub ↗',

  secretsTitle: 'WrtNova ne voit jamais vos secrets',
  secretsText:
    "Mot de passe root, clés WiFi, clés WireGuard, jetons d'API : l'image entière est assemblée dans votre navigateur et envoyée directement au serveur de compilation OpenWrt que vous choisissez. Rien ne transite par un backend WrtNova.",

  statSsh: 'Sessions SSH',
  statLuci: 'Clics LuCI',
  statSecrets: 'Secrets qui nous parviennent',
  statFlash: 'Flash',

  featuresHeading: 'Ce que le premier démarrage configure',
  featureVlansTitle: 'VLANs sans apprendre les VLANs',
  featureVlansDesc:
    'Segmentez en zones LAN, Invité et IoT. WrtNova détecte votre matériel de commutateur et configure correctement le marquage — sans se perdre dans DSA vs swconfig.',
  featureRoamTitle: "Roaming réglé d'origine",
  featureRoamDesc:
    "Chaque SSID embarque le 802.11k/v/r et le band steering usteer, seuils déjà réglés. L'IoT reste en 2,4 GHz pur — les vieux appareils ne croisent jamais les caprices du 11r/k/v.",
  featureMeshTitle: 'Backhaul mesh, VLAN compris',
  featureMeshDesc:
    "Mesh 802.11s avec chiffrement SAE et peering réglé, batman-adv en option. Tous les VLAN sont trunkés sur le lien mesh — l'invité reste invité sur chaque nœud.",
  featureVpnTitle: 'VPN intégré — ou un clic vers WARP',
  featureVpnDesc:
    'Routez via votre propre fournisseur WireGuard, ou pré-remplissez une configuration Cloudflare WARP gratuite en un clic. Il obtient automatiquement son propre réseau et SSID.',
  featureMultiwanTitle: 'Le failover est déjà câblé',
  featureMultiwanDesc:
    'Second WAN, modem LTE ou téléphone en USB — mwan3 arrive configuré : suivi de santé, répartition de charge, sessions HTTPS persistantes.',
  featurePrivacyTitle: 'Privé et sans publicité dès le départ',
  featurePrivacyDesc:
    "Blocage des publicités à l'échelle du réseau et DNS chiffré. AdGuard Home sur du matériel performant, un fallback léger sur les routeurs plus petits — choisi automatiquement.",
  featureForwardTitle: 'Redirections de ports en une ligne',
  featureForwardDesc:
    'Une ligne par hôte crée ensemble le bail statique et ses redirections depuis le WAN, nommées dans le pare-feu. La réservation et la redirection ne divergent jamais.',
  featureIpv6Title: 'Serveurs IPv6, sans bricolage NAT',
  featureIpv6Desc:
    'Chaque hôte reçoit une adresse ::N stable qui survit aux changements de préfixe, son propre sous-domaine DDNS Cloudflare et une règle de pare-feu limitée aux ports listés.',
  featureFleetTitle: 'Une config, toute la flotte',
  featureFleetDesc:
    "La même image avec AP_MODE=1 devient point d'accès et switch managé : mêmes SSID, mêmes VLAN, les clients roament entre les nœuds. Le fleet builder construit routeur et AP en une session.",
  featureFlashTitle: 'Flashez une fois, entièrement configuré',
  featureFlashDesc:
    "Pas de menus LuCI, pas de SSH. WrtNova intègre toute votre configuration dans un script de premier démarrage. Flashez l'image et le routeur se configure tout seul.",
  featureMoreText:
    'En plus : instances DHCP par réseau, DDNS Cloudflare, PPPoE, pontage du port WAN, NAT offloading, NTP, zram et plus.',

  ctaTagline: 'Votre routeur, votre configuration — intégrée dès le premier démarrage.',
  footerNotAffiliated: 'Non affilié à Cloudflare, Inc. ni approuvé par elle.',
  footerTrademark: 'Cloudflare et WARP sont des marques déposées de leurs propriétaires respectifs.',

  themeLabel: 'Thème',
  langLabel: 'Langue',
};

const pl: LandingCatalog = {
  heroTagline: 'OpenWrt · Budowany w przeglądarce · Zero SSH',
  heroTitleA: 'Wgraj raz.',
  heroTitleB: 'Wszystko jest już skonfigurowane.',
  heroSubtitle:
    'Zbuduj w pełni skonfigurowany obraz OpenWrt — VLAN-y, WiFi, VPN, blokowanie reklam — w przeglądarce.',
  singleNodeBuilder: 'Kreator pojedynczego węzła →',
  multiNodeFleetBuilder: 'Kreator floty wielu węzłów →',
  fleetBuilderLink: 'Kreator floty →',
  viewSourceGithub: 'Zobacz kod źródłowy na GitHub ↗',

  secretsTitle: 'WrtNova nigdy nie widzi Twoich sekretów',
  secretsText:
    'Hasło roota, hasła WiFi, klucze WireGuard, tokeny API: cały obraz jest składany w Twojej przeglądarce i wysyłany prosto do wybranego przez Ciebie serwera kompilacji OpenWrt. Nic z tego nie przechodzi przez backend WrtNova.',

  statSsh: 'Sesje SSH',
  statLuci: 'Kliknięcia w LuCI',
  statSecrets: 'Sekrety wysłane do nas',
  statFlash: 'Wgranie',

  featuresHeading: 'Co konfiguruje pierwsze uruchomienie',
  featureVlansTitle: 'VLAN-y bez nauki VLAN-ów',
  featureVlansDesc:
    'Podziel na strefy LAN, Gości i IoT. WrtNova wykrywa sprzęt przełącznika i poprawnie konfiguruje tagowanie — bez zagłębiania się w DSA kontra swconfig.',
  featureRoamTitle: 'Roaming zestrojony od razu',
  featureRoamDesc:
    'Każde SSID ma 802.11k/v/r i band steering przez usteer, progi już dostrojone. IoT zostaje na czystym 2,4 GHz — stare urządzenia nie zobaczą dziwactw 11r/k/v.',
  featureMeshTitle: 'Backhaul mesh, VLAN-y w pakiecie',
  featureMeshDesc:
    'Mesh 802.11s z szyfrowaniem SAE i dostrojonym peeringiem, opcjonalnie batman-adv. Wszystkie VLAN-y są trunkowane przez łącze mesh — gość zostaje gościem na każdym węźle.',
  featureVpnTitle: 'VPN wbudowany — lub jeden klik do WARP',
  featureVpnDesc:
    'Kieruj ruch przez własnego dostawcę WireGuard lub wypełnij bezpłatną konfigurację Cloudflare WARP jednym kliknięciem. Automatycznie otrzyma własną sieć i SSID.',
  featureMultiwanTitle: 'Failover już podpięty',
  featureMultiwanDesc:
    'Drugi WAN, modem LTE albo telefon po USB — mwan3 przychodzi skonfigurowany: monitorowanie łącza, równoważenie obciążenia, sticky HTTPS.',
  featurePrivacyTitle: 'Prywatność i blokowanie reklam od razu po wyjęciu z pudełka',
  featurePrivacyDesc:
    'Blokowanie reklam w całej sieci i szyfrowany DNS. AdGuard Home na wydajnym sprzęcie, lekka alternatywa na mniejszych routerach — wybierana automatycznie.',
  featureForwardTitle: 'Przekierowania w jednej linii',
  featureForwardDesc:
    'Jedna linia na hosta tworzy razem statyczną dzierżawę i przekierowania portów z WAN, nazwane w zaporze. Rezerwacja i przekierowanie nigdy się nie rozjadą.',
  featureIpv6Title: 'Serwery IPv6 bez sztuczek NAT',
  featureIpv6Desc:
    'Każdy host dostaje stabilny adres ::N odporny na zmianę prefiksu, własną subdomenę Cloudflare DDNS i regułę zapory dokładnie na wskazane porty.',
  featureFleetTitle: 'Jedna konfiguracja, cała flota',
  featureFleetDesc:
    'Ten sam obraz z AP_MODE=1 staje się punktem dostępowym i zarządzalnym switchem: te same SSID, te same VLAN-y, klienci roamują między węzłami. Kreator floty buduje router i AP w jednej sesji.',
  featureFlashTitle: 'Wgraj raz, w pełni skonfigurowany',
  featureFlashDesc:
    'Bez menu LuCI, bez SSH. WrtNova wbudowuje całą konfigurację w skrypt pierwszego uruchomienia. Wgraj obraz — router skonfiguruje się sam.',
  featureMoreText:
    'Dodatkowo osobne instancje DHCP per sieć, Cloudflare DDNS, PPPoE, mostkowanie portu WAN, NAT offloading, NTP, zram i więcej.',

  ctaTagline: 'Twój router, Twoja konfiguracja — wbudowana od pierwszego uruchomienia.',
  footerNotAffiliated: 'Nie powiązane z Cloudflare, Inc. ani przez nią popierane.',
  footerTrademark: 'Cloudflare i WARP są zastrzeżonymi znakami towarowymi swoich właścicieli.',

  themeLabel: 'Motyw',
  langLabel: 'Język',
};

const ru: LandingCatalog = {
  heroTagline: 'OpenWrt · Собирается в браузере · Без SSH',
  heroTitleA: 'Прошейте один раз.',
  heroTitleB: 'Всё уже настроено.',
  heroSubtitle:
    'Создайте полностью настроенный образ OpenWrt — VLAN, WiFi, VPN, блокировка рекламы — прямо в браузере.',
  singleNodeBuilder: 'Одиночный узел →',
  multiNodeFleetBuilder: 'Мульти-узловой сборщик →',
  fleetBuilderLink: 'Сборщик флота →',
  viewSourceGithub: 'Исходный код на GitHub ↗',

  secretsTitle: 'WrtNova никогда не видит ваши секреты',
  secretsText:
    'Пароль root, пароли WiFi, ключи WireGuard, токены API: весь образ собирается в вашем браузере и отправляется напрямую на выбранный вами сервер сборки OpenWrt. Ничего из этого не проходит через бэкенд WrtNova.',

  statSsh: 'Сессий SSH',
  statLuci: 'Кликов в LuCI',
  statSecrets: 'Секретов отправлено нам',
  statFlash: 'Прошивка',

  featuresHeading: 'Что настраивает первая загрузка',
  featureVlansTitle: 'VLAN без изучения VLAN',
  featureVlansDesc:
    'Разделите на зоны LAN, Гость и IoT. WrtNova определяет ваше оборудование коммутатора и правильно настраивает теги — без погружения в DSA vs swconfig.',
  featureRoamTitle: 'Роуминг настроен из коробки',
  featureRoamDesc:
    'Каждый SSID идёт с 802.11k/v/r и band steering через usteer, пороги уже подобраны. IoT остаётся на чистых 2,4 ГГц — старые устройства не столкнутся с причудами 11r/k/v.',
  featureMeshTitle: 'Mesh-транспорт, VLAN в комплекте',
  featureMeshDesc:
    '802.11s mesh с шифрованием SAE и настроенным пирингом, опционально batman-adv сверху. Все VLAN транкуются через mesh-линк — гостевая сеть остаётся изолированной на каждом узле.',
  featureVpnTitle: 'VPN встроен — или один клик для WARP',
  featureVpnDesc:
    'Маршрутизируйте через собственного провайдера WireGuard или предзаполните бесплатную конфигурацию Cloudflare WARP одним кликом. Автоматически получит собственную сеть и SSID.',
  featureMultiwanTitle: 'Резервный канал уже подключён',
  featureMultiwanDesc:
    'Второй WAN, LTE-модем или телефон по USB — mwan3 приходит настроенным: контроль доступности, балансировка, липкие HTTPS-сессии.',
  featurePrivacyTitle: 'Конфиденциальность и блокировка рекламы из коробки',
  featurePrivacyDesc:
    'Сетевая блокировка рекламы и зашифрованный DNS. AdGuard Home на мощном оборудовании, лёгкая альтернатива на маленьких роутерах — выбирается автоматически.',
  featureForwardTitle: 'Проброс портов в одну строку',
  featureForwardDesc:
    'Одна строка на хост создаёт статическую аренду и пробросы портов с WAN вместе, с именами в файрволе. Аренда и проброс никогда не разойдутся.',
  featureIpv6Title: 'IPv6-серверы без NAT-костылей',
  featureIpv6Desc:
    'Каждый хост получает стабильный адрес ::N, переживающий смену префикса, собственный поддомен Cloudflare DDNS и правило файрвола ровно на перечисленные порты.',
  featureFleetTitle: 'Один конфиг — весь парк',
  featureFleetDesc:
    'Тот же образ с AP_MODE=1 становится точкой доступа и управляемым коммутатором: те же SSID, те же VLAN, клиенты роумятся между узлами. Конструктор парка собирает роутер и все ТД за один сеанс.',
  featureFlashTitle: 'Прошить один раз, всё уже настроено',
  featureFlashDesc:
    'Без меню LuCI, без SSH. WrtNova запекает всю вашу конфигурацию в скрипт первой загрузки. Прошейте образ — роутер настроит себя сам.',
  featureMoreText:
    'Плюс DHCP-инстансы для каждой сети, Cloudflare DDNS, PPPoE, мост WAN-порта, NAT-offloading, NTP, zram и другое.',

  ctaTagline: 'Ваш роутер, ваша конфигурация — встроена с первой загрузки.',
  footerNotAffiliated: 'Не связан с Cloudflare, Inc. и не одобрен ею.',
  footerTrademark:
    'Cloudflare и WARP являются зарегистрированными товарными знаками соответствующих владельцев.',

  themeLabel: 'Тема',
  langLabel: 'Язык',
};

const zh: LandingCatalog = {
  heroTagline: 'OpenWrt · 浏览器构建 · 无需 SSH',
  heroTitleA: '刷写一次。',
  heroTitleB: '一切都已配置好。',
  heroSubtitle: '在浏览器中构建完整配置的 OpenWrt 镜像——VLAN、WiFi、VPN、广告拦截，一次搞定。',
  singleNodeBuilder: '单节点构建器 →',
  multiNodeFleetBuilder: '多节点舰队构建器 →',
  fleetBuilderLink: '舰队构建器 →',
  viewSourceGithub: '在 GitHub 上查看源代码 ↗',

  secretsTitle: 'WrtNova 从不接触您的机密',
  secretsText:
    'root 密码、WiFi 密码、WireGuard 密钥、API 令牌：整个镜像都在您的浏览器中组装，并直接发送到您选择的 OpenWrt 构建服务器。它们从不经过 WrtNova 的后端。',

  statSsh: 'SSH 会话',
  statLuci: 'LuCI 点击',
  statSecrets: '发送给我们的机密',
  statFlash: '刷写',

  featuresHeading: '首次启动会配置什么',
  featureVlansTitle: '无需深入了解 VLAN 即可配置 VLAN',
  featureVlansDesc:
    '分割为 LAN、访客和物联网区域。WrtNova 自动检测交换机硬件并正确配置标记——无需研究 DSA 与 swconfig 的差异。',
  featureRoamTitle: '漫游开箱即调优',
  featureRoamDesc:
    '每个 SSID 自带 802.11k/v/r 快速切换与 usteer 频段引导，阈值已预先调优。IoT 网络保持纯 2.4 GHz，老设备不会遇到 11r/k/v 兼容问题。',
  featureMeshTitle: 'Mesh 回程，VLAN 同行',
  featureMeshDesc:
    '802.11s mesh 配 SAE 加密与调优的对等参数，可选叠加 batman-adv。所有 VLAN 经 mesh 链路中继，访客网络在每个节点上依然隔离。',
  featureVpnTitle: '内置 VPN——或一键连接 WARP',
  featureVpnDesc:
    '通过您自己的 WireGuard 提供商路由，或一键预填免费的 Cloudflare WARP 配置。它将自动获得独立的网络和 SSID。',
  featureMultiwanTitle: '故障转移已预先接好',
  featureMultiwanDesc:
    '第二条 WAN、LTE 模块或 USB 共享的手机——mwan3 出厂即配置好：链路健康检测、负载均衡、HTTPS 会话保持。',
  featurePrivacyTitle: '开箱即用的隐私保护和广告屏蔽',
  featurePrivacyDesc:
    '全网广告拦截和加密 DNS。在性能强大的硬件上运行 AdGuard Home，在小型路由器上自动切换为轻量级备选方案。',
  featureForwardTitle: '一行搞定端口转发',
  featureForwardDesc:
    '每台主机一行，同时生成静态租约与 WAN 端口转发，并在防火墙中命名。租约与转发规则永远不会失配。',
  featureIpv6Title: 'IPv6 服务器，无需 NAT',
  featureIpv6Desc:
    '每台主机获得稳定的 ::N 地址（前缀变更后依然有效）、独立的 Cloudflare DDNS 子域名，以及只放行所列端口的防火墙规则。',
  featureFleetTitle: '一份配置，整个网络',
  featureFleetDesc:
    '同一镜像设置 AP_MODE=1 即变身接入点和管理型交换机：相同 SSID、相同 VLAN，客户端在节点间自由漫游。舰队构建器可一次构建路由器和全部 AP。',
  featureFlashTitle: '一次刷写，全程配置好',
  featureFlashDesc:
    '无需 LuCI 菜单，无需 SSH。WrtNova 将完整配置烘焙到首次启动脚本中。刷写镜像后，路由器自动完成配置。',
  featureMoreText:
    '还包括：按网络独立的 DHCP 实例、Cloudflare DDNS、PPPoE、WAN 口桥接、NAT 卸载、NTP、zram 等。',

  ctaTagline: '您的路由器，您的配置——从第一次启动就已烘焙好。',
  footerNotAffiliated: '与 Cloudflare, Inc. 无关联，亦未获其背书。',
  footerTrademark: 'Cloudflare 和 WARP 是其各自所有者的注册商标。',

  themeLabel: '主题',
  langLabel: '语言',
};

export const LANDING: Record<string, LandingCatalog> = { en, de, es, fr, pl, ru, zh };
