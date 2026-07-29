/* Generated from bridges/nutribiotic/out/socal_month_plan_2026-07-28.csv.
   Derived and disposable, per the one-source-of-truth rule: regenerate from the
   plan CSV, never hand-edit account facts here. */

export type PlanStop = { name: string; street: string; city: string; phone: string;
  lastOrder: string; revenue: string; flags: string; maps: string };
export type PlanDay = { id: string; route: string; note: string; stops: PlanStop[] };

export const MONTH_PLAN: PlanDay[] = [
  {
    "id": "Day 1",
    "route": "LA west + South Bay",
    "note": "",
    "stops": [
      {
        "name": "Mcmullen Chiropractic",
        "street": "8530 WILSHIRE BLVD STE 440",
        "city": "Beverly Hills",
        "phone": "310-657-3412",
        "lastOrder": "2025-08-08",
        "revenue": "1814.32",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=8530+WILSHIRE+BLVD+STE+440,+BEVERLY+HILLS,+CA"
      },
      {
        "name": "Michael Vercos L.Ac.",
        "street": "2901 OCEAN PARK BLVD STE 126",
        "city": "Santa Monica",
        "phone": "310-399-4043",
        "lastOrder": "2024-08-19",
        "revenue": "2533.45",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=2901+OCEAN+PARK+BLVD+STE+126,+SANTA+MONICA,+CA"
      },
      {
        "name": "Skin Health Llc",
        "street": "1207 4TH ST STE 100",
        "city": "Santa Monica",
        "phone": "310-264-2228",
        "lastOrder": "2025-01-14",
        "revenue": "1464.48",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=1207+4TH+ST+STE+100,+SANTA+MONICA,+CA"
      },
      {
        "name": "Jeanette Ryan, Dc, Ifmcp",
        "street": "1964 19TH ST APT A",
        "city": "Santa Monica",
        "phone": "310-395-3653",
        "lastOrder": "2026-01-12",
        "revenue": "161.94",
        "flags": "warm: ordered 2026",
        "maps": "https://maps.apple.com/?daddr=1964+19TH+ST+APT+A,+SANTA+MONICA,+CA"
      },
      {
        "name": "Santa Monica Homepathic Pharmacy",
        "street": "629 BROADWAY",
        "city": "Santa Monica",
        "phone": "310-395-0542",
        "lastOrder": "2026-01-26",
        "revenue": "39367.47",
        "flags": "warm: ordered 2026",
        "maps": "https://maps.apple.com/?daddr=629+BROADWAY,+SANTA+MONICA,+CA"
      },
      {
        "name": "Love Natural Health Llc",
        "street": "601 24TH ST",
        "city": "Hermosa Beach",
        "phone": "310-961-8530",
        "lastOrder": "2025-01-15",
        "revenue": "154.86",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=601+24TH+ST,+HERMOSA+BEACH,+CA"
      },
      {
        "name": "Whole Foods Market/Torrance",
        "street": "2655 PACIFIC COAST HWY",
        "city": "Torrance",
        "phone": "310-257-8700",
        "lastOrder": "2025-02-24",
        "revenue": "22743.93",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=2655+PACIFIC+COAST+HWY,+TORRANCE,+CA"
      },
      {
        "name": "Marsha Connor, Omd, L.Ac.",
        "street": "4121 SAN RAFAEL AVE",
        "city": "Los Angeles",
        "phone": "323-225-0820",
        "lastOrder": "2025-11-20",
        "revenue": "753.73",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=4121+SAN+RAFAEL+AVE,+LOS+ANGELES,+CA"
      }
    ]
  },
  {
    "id": "Day 2",
    "route": "LA north + Valley + Palmdale",
    "note": "",
    "stops": [
      {
        "name": "Look Good Feel Great",
        "street": "3701 CAHUENGA BLVD STE 4",
        "city": "Studio City",
        "phone": "818-752-2185",
        "lastOrder": "2025-08-26",
        "revenue": "13369.24",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=3701+CAHUENGA+BLVD+STE+4,+STUDIO+CITY,+CA"
      },
      {
        "name": "Limehouse Veterinary Clinic",
        "street": "1733 VICTORY BLVD",
        "city": "Glendale",
        "phone": "818-761-0787",
        "lastOrder": "2024-09-12",
        "revenue": "3939.00",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=1733+VICTORY+BLVD,+GLENDALE,+CA"
      },
      {
        "name": "Nhc Group",
        "street": "2049 N LINCOLN ST",
        "city": "Burbank",
        "phone": "818-841-8825",
        "lastOrder": "2025-12-19",
        "revenue": "83345.16",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=2049+N+LINCOLN+ST,+BURBANK,+CA"
      },
      {
        "name": "Alfred W. Garbutt, D.C.",
        "street": "6708 FOOTHILL BLVD STE 108",
        "city": "Tujunga",
        "phone": "818-248-5570",
        "lastOrder": "2025-11-17",
        "revenue": "497.75",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=6708+FOOTHILL+BLVD+STE+108,+TUJUNGA,+CA"
      },
      {
        "name": "Durand-Evans, D. C.",
        "street": "3532 OCEAN VIEW BLVD",
        "city": "Glendale",
        "phone": "818-249-2079",
        "lastOrder": "2025-09-16",
        "revenue": "49469.15",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=3532+OCEAN+VIEW+BLVD,+GLENDALE,+CA"
      },
      {
        "name": "The Fish Lady",
        "street": "703 ARROYO ST UNIT D",
        "city": "San Fernando",
        "phone": "818-997-6091",
        "lastOrder": "2024-03-05",
        "revenue": "1728.02",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=703+ARROYO+ST+UNIT+D,+SAN+FERNANDO,+CA"
      },
      {
        "name": "Merit Homeopathy/Knollwood Pharmacy",
        "street": "16911 SAN FERNANDO MISSION BLVD",
        "city": "Granada Hills",
        "phone": "818-831-1727",
        "lastOrder": "2026-01-29",
        "revenue": "6425.28",
        "flags": "warm: ordered 2026",
        "maps": "https://maps.apple.com/?daddr=16911+SAN+FERNANDO+MISSION+BLVD,+GRANADA+HILLS,+CA"
      },
      {
        "name": "Spice Of Life",
        "street": "15501 FRIAR ST",
        "city": "Van Nuys",
        "phone": "818-909-0052",
        "lastOrder": "2024-11-04",
        "revenue": "6915.94",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=15501+FRIAR+ST,+VAN+NUYS,+CA"
      },
      {
        "name": "Greenberg, Dr. Geraldine",
        "street": "4930 VARNA AVE",
        "city": "Sherman Oaks",
        "phone": "818-986-9565",
        "lastOrder": "2026-01-05",
        "revenue": "1852.58",
        "flags": "warm: ordered 2026",
        "maps": "https://maps.apple.com/?daddr=4930+VARNA+AVE,+SHERMAN+OAKS,+CA"
      },
      {
        "name": "Parrots Naturally",
        "street": "22140 VENTURA BLVD STE 1",
        "city": "Woodland Hls",
        "phone": "818-404-0096",
        "lastOrder": "2025-03-19",
        "revenue": "2514.44",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=22140+VENTURA+BLVD+STE+1,+WOODLAND+HLS,+CA"
      },
      {
        "name": "Lisa Young, Ntp",
        "street": "1137 W AVENUE M14 STE 102",
        "city": "Palmdale",
        "phone": "661-274-7952",
        "lastOrder": "2024-06-17",
        "revenue": "2400.93",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=1137+W+AVENUE+M14+STE+102,+PALMDALE,+CA"
      }
    ]
  },
  {
    "id": "Day 3",
    "route": "Orange County sweep",
    "note": "Biggest day, one corridor Anaheim to Mission Viejo.",
    "stops": [
      {
        "name": "Dr. Pure Nature",
        "street": "14780 BEACH BLVD",
        "city": "La Mirada",
        "phone": "714-562-1001",
        "lastOrder": "2025-12-10",
        "revenue": "49075.08",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=14780+BEACH+BLVD,+LA+MIRADA,+CA"
      },
      {
        "name": "For Your Health",
        "street": "6433 E LOOKOUT LN",
        "city": "Anaheim",
        "phone": "310-227-3766",
        "lastOrder": "2024-09-12",
        "revenue": "2962.41",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=6433+E+LOOKOUT+LN,+ANAHEIM,+CA"
      },
      {
        "name": "Natulab, Inc.",
        "street": "1571 S SUNKIST ST STE D",
        "city": "Anaheim",
        "phone": "714-941-9411",
        "lastOrder": "2024-07-22",
        "revenue": "47176.19",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=1571+S+SUNKIST+ST+STE+D,+ANAHEIM,+CA"
      },
      {
        "name": "Better Life Health Foods",
        "street": "2380 N TUSTIN AVE STE H",
        "city": "Santa Ana",
        "phone": "714-547-0613",
        "lastOrder": "2026-01-22",
        "revenue": "3513.20",
        "flags": "warm: ordered 2026",
        "maps": "https://maps.apple.com/?daddr=2380+N+TUSTIN+AVE+STE+H,+SANTA+ANA,+CA"
      },
      {
        "name": "Living Younger Naturally",
        "street": "3857 BIRCH ST PMB 294",
        "city": "Newport Beach",
        "phone": "714-404-4080",
        "lastOrder": "2025-01-29",
        "revenue": "1029.16",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=3857+BIRCH+ST+PMB+294,+NEWPORT+BEACH,+CA"
      },
      {
        "name": "Pacific Total Body Wellness",
        "street": "275 VICTORIA ST STE 2C",
        "city": "Costa Mesa",
        "phone": "949-645-6325",
        "lastOrder": "2025-12-10",
        "revenue": "5640.22",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=275+VICTORIA+ST+STE+2C,+COSTA+MESA,+CA"
      },
      {
        "name": "Waters Of Life Cleansing And Renewal",
        "street": "711 W 17TH ST STE D9",
        "city": "Costa Mesa",
        "phone": "714-472-5617",
        "lastOrder": "2025-02-25",
        "revenue": "928.58",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=711+W+17TH+ST+STE+D9,+COSTA+MESA,+CA"
      },
      {
        "name": "Facial Lounge",
        "street": "3810 E COAST HWY STE 1",
        "city": "Corona Dl Mar",
        "phone": "949-432-5915",
        "lastOrder": "2025-08-05",
        "revenue": "15190.32",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=3810+E+COAST+HWY+STE+1,+CORONA+DL+MAR,+CA"
      },
      {
        "name": "Acorn Oaks Wellness",
        "street": "32 ALISO RIDGE LOOP",
        "city": "Mission Viejo",
        "phone": "818-731-3759",
        "lastOrder": "2025-07-17",
        "revenue": "97.92",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=32+ALISO+RIDGE+LOOP,+MISSION+VIEJO,+CA"
      },
      {
        "name": "The Optimal Wellness Center",
        "street": "27401 LOS ALTOS STE 300",
        "city": "Mission Viejo",
        "phone": "949-297-3711",
        "lastOrder": "2025-07-14",
        "revenue": "2848.24",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=27401+LOS+ALTOS+STE+300,+MISSION+VIEJO,+CA"
      },
      {
        "name": "Pure Life Health Equipment",
        "street": "5412 BOLSA AVE UNIT A",
        "city": "Huntingtn Bch",
        "phone": "657-215-2910",
        "lastOrder": "2026-01-09",
        "revenue": "19756.87",
        "flags": "warm: ordered 2026",
        "maps": "https://maps.apple.com/?daddr=5412+BOLSA+AVE+UNIT+A,+HUNTINGTN+BCH,+CA"
      },
      {
        "name": "Lazy Acres Market",
        "street": "2080 N BELLFLOWER BLVD",
        "city": "Long Beach",
        "phone": "562-430-4134",
        "lastOrder": "2025-07-23",
        "revenue": "",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=2080+N+BELLFLOWER+BLVD,+LONG+BEACH,+CA"
      }
    ]
  },
  {
    "id": "Day 4",
    "route": "Inland run to the Desert",
    "note": "Long miles east. Optional sleep-away in Palm Springs if it runs long.",
    "stops": [
      {
        "name": "Ur Natural Shine Llc",
        "street": "1613 BUENA VISTA ST",
        "city": "Duarte",
        "phone": "626-392-1787",
        "lastOrder": "2024-01-23",
        "revenue": "884.82",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=1613+BUENA+VISTA+ST,+DUARTE,+CA"
      },
      {
        "name": "Natura Lifestyle Produce",
        "street": "203 LEMON CREEK DR STE A",
        "city": "Walnut",
        "phone": "323-401-3649",
        "lastOrder": "2025-03-28",
        "revenue": "57995.78",
        "flags": "address-level pin, not rooftop",
        "maps": "https://maps.apple.com/?daddr=203+LEMON+CREEK+DR+STE+A,+WALNUT,+CA"
      },
      {
        "name": "Great Earth Vitamins",
        "street": "2872 E IMPERIAL HWY",
        "city": "Brea",
        "phone": "714-528-2958",
        "lastOrder": "2025-03-06",
        "revenue": "1232.03",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=2872+E+IMPERIAL+HWY,+BREA,+CA"
      },
      {
        "name": "United Chiropractic",
        "street": "410 N LEMON ST",
        "city": "Ontario",
        "phone": "909-984-2765",
        "lastOrder": "2024-11-04",
        "revenue": "1401.89",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=410+N+LEMON+ST,+ONTARIO,+CA"
      },
      {
        "name": "Nature's Natural Health Food Store & Cafe",
        "street": "555 S SUNRISE WAY STE 301",
        "city": "Palm Springs",
        "phone": "760-323-9487",
        "lastOrder": "2026-01-21",
        "revenue": "50702.02",
        "flags": "warm: ordered 2026",
        "maps": "https://maps.apple.com/?daddr=555+S+SUNRISE+WAY+STE+301,+PALM+SPRINGS,+CA"
      },
      {
        "name": "Herbs And U",
        "street": "2117 WEST NICOLA ROAD",
        "city": "Palm Springs",
        "phone": "760-770-1068",
        "lastOrder": "2025-12-02",
        "revenue": "8980.51",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=2117+WEST+NICOLA+ROAD,+PALM+SPRINGS,+CA"
      },
      {
        "name": "Health Spectrum",
        "street": "149 COLUMBIA DR",
        "city": "Rancho Mirage",
        "phone": "760-464-3441",
        "lastOrder": "2024-01-18",
        "revenue": "1781.73",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=149+COLUMBIA+DR,+RANCHO+MIRAGE,+CA"
      },
      {
        "name": "Sue's Health Foods",
        "street": "56840 29 PALMS HWY",
        "city": "Yucca Valley",
        "phone": "760-365-1158",
        "lastOrder": "2025-09-25",
        "revenue": "17498.99",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=56840+29+PALMS+HWY,+YUCCA+VALLEY,+CA"
      }
    ]
  },
  {
    "id": "Trip A",
    "route": "San Diego overnight - down the night before, sleep SD, work it northbound home",
    "note": "Sleep-away. Down the night before, sleep in San Diego, work it all northbound home.",
    "stops": [
      {
        "name": "Stephanie Rosenblatt, L.Ac",
        "street": "6429 GLIDDEN ST",
        "city": "San Diego",
        "phone": "619-519-4305",
        "lastOrder": "2025-07-15",
        "revenue": "1412.50",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=6429+GLIDDEN+ST,+SAN+DIEGO,+CA"
      },
      {
        "name": "Anthony Hagner Chiropractic",
        "street": "1020 2ND ST STE A",
        "city": "Encinitas",
        "phone": "760-452-2997",
        "lastOrder": "2025-08-04",
        "revenue": "5444.24",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=1020+2ND+ST+STE+A,+ENCINITAS,+CA"
      },
      {
        "name": "Christopher Meanley, Dc",
        "street": "230 2ND ST STE 101",
        "city": "Encinitas",
        "phone": "760-632-0098",
        "lastOrder": "2026-01-30",
        "revenue": "14210.27",
        "flags": "warm: ordered 2026",
        "maps": "https://maps.apple.com/?daddr=230+2ND+ST+STE+101,+ENCINITAS,+CA"
      },
      {
        "name": "Pure Skin Science",
        "street": "647 CAMINO DE LOS MARES STE 108-280",
        "city": "San Clemente",
        "phone": "310-500-8062",
        "lastOrder": "2025-09-19",
        "revenue": "3517.76",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=647+CAMINO+DE+LOS+MARES+STE+108-280,+SAN+CLEMENTE,+CA"
      },
      {
        "name": "Major Market",
        "street": "845 S MAIN AVE",
        "city": "Fallbrook",
        "phone": "760-723-0857",
        "lastOrder": "2025-09-04",
        "revenue": "9050.68",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=845+S+MAIN+AVE,+FALLBROOK,+CA"
      },
      {
        "name": "Donohoe Chiropractic",
        "street": "41880 KALMIA ST STE 135",
        "city": "Murrieta",
        "phone": "951-677-6500",
        "lastOrder": "2025-10-08",
        "revenue": "985.12",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=41880+KALMIA+ST+STE+135,+MURRIETA,+CA"
      },
      {
        "name": "Harmony Healing Naturopathic Clinic",
        "street": "29595 PUJOL ST APT 5201",
        "city": "Temecula",
        "phone": "408-730-0700",
        "lastOrder": "2025-01-30",
        "revenue": "2853.42",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=29595+PUJOL+ST+APT+5201,+TEMECULA,+CA"
      }
    ]
  },
  {
    "id": "Trip B day 1",
    "route": "Ventura-Conejo + Santa Barbara - sleep Santa Maria",
    "note": "Sleep-away loop, night one. Sleep Santa Maria.",
    "stops": [
      {
        "name": "Directly From Nature",
        "street": "621 RUSHING CREEK PL",
        "city": "Thousand Oaks",
        "phone": "800-214-2850",
        "lastOrder": "2025-12-22",
        "revenue": "15059.51",
        "flags": "address-level pin, not rooftop",
        "maps": "https://maps.apple.com/?daddr=621+RUSHING+CREEK+PL,+THOUSAND+OAKS,+CA"
      },
      {
        "name": "Body Sattva Healing Arts",
        "street": "1414 E THOUSAND OAKS BLVD STE 211",
        "city": "Thousand Oaks",
        "phone": "805-497-0300",
        "lastOrder": "2026-01-22",
        "revenue": "502.94",
        "flags": "warm: ordered 2026",
        "maps": "https://maps.apple.com/?daddr=1414+E+THOUSAND+OAKS+BLVD+STE+211,+THOUSAND+OAKS,+CA"
      },
      {
        "name": "Sadie Carr",
        "street": "677 WHALEN WAY",
        "city": "Oxnard",
        "phone": "",
        "lastOrder": "2024-10-11",
        "revenue": "",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=677+WHALEN+WAY,+OXNARD,+CA"
      },
      {
        "name": "Jan Sovich, L.Ac., O.M.D.",
        "street": "260 MAPLE CT STE 112",
        "city": "Ventura",
        "phone": "805-644-6969",
        "lastOrder": "2024-12-04",
        "revenue": "1174.37",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=260+MAPLE+CT+STE+112,+VENTURA,+CA"
      },
      {
        "name": "Vasari Plaster",
        "street": "115 N OLIVE AVE",
        "city": "Ventura",
        "phone": "805-667-8454",
        "lastOrder": "2024-09-04",
        "revenue": "18188.68",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=115+N+OLIVE+AVE,+VENTURA,+CA"
      },
      {
        "name": "Whole Foods Market/Santa Barbara",
        "street": "3761 STATE STREET",
        "city": "Santa Barbara",
        "phone": "805-837-6959",
        "lastOrder": "2024-10-14",
        "revenue": "49828.21",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=3761+STATE+STREET,+SANTA+BARBARA,+CA"
      }
    ]
  },
  {
    "id": "Trip B day 2",
    "route": "Orcutt + Grover Beach, cross to Bakersfield + Kernville - sleep Bakersfield",
    "note": "Sleep-away loop, night two. Cross from the coast to the valley, sleep Bakersfield.",
    "stops": [
      {
        "name": "Alchepharma Naturals",
        "street": "1108 E CLARK AVE STE 180",
        "city": "Orcutt",
        "phone": "805-938-5657",
        "lastOrder": "2025-09-19",
        "revenue": "106466.86",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=1108+E+CLARK+AVE+STE+180,+ORCUTT,+CA"
      },
      {
        "name": "Doctors Research, Inc.",
        "street": "1036 W GRAND AVE",
        "city": "Grover Beach",
        "phone": "805-489-7185",
        "lastOrder": "2026-01-13",
        "revenue": "12740.87",
        "flags": "warm: ordered 2026",
        "maps": "https://maps.apple.com/?daddr=1036+W+GRAND+AVE,+GROVER+BEACH,+CA"
      },
      {
        "name": "Linda Enemark, D.C.",
        "street": "5251 OFFICE PARK DR STE 120",
        "city": "Bakersfield",
        "phone": "661-428-6250",
        "lastOrder": "2025-10-07",
        "revenue": "1202.55",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=5251+OFFICE+PARK+DR+STE+120,+BAKERSFIELD,+CA"
      },
      {
        "name": "Quantum Chiropractic",
        "street": "2121 17TH ST STE B",
        "city": "Bakersfield",
        "phone": "661-322-9480",
        "lastOrder": "2025-03-05",
        "revenue": "24332.00",
        "flags": "CALL FIRST: Places says closed",
        "maps": "https://maps.apple.com/?daddr=2121+17TH+ST+STE+B,+BAKERSFIELD,+CA"
      },
      {
        "name": "Apple Tree Health Foods",
        "street": "1910 N CHESTER AVE",
        "city": "Bakersfield",
        "phone": "661-393-6287",
        "lastOrder": "2025-11-12",
        "revenue": "13372.52",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=1910+N+CHESTER+AVE,+BAKERSFIELD,+CA"
      },
      {
        "name": "Natural Health",
        "street": "11901 SIERRA WAY OFC 15",
        "city": "Kernville",
        "phone": "760-376-3777",
        "lastOrder": "2026-01-26",
        "revenue": "15930.39",
        "flags": "warm: ordered 2026",
        "maps": "https://maps.apple.com/?daddr=11901+SIERRA+WAY+OFC+15,+KERNVILLE,+CA"
      }
    ]
  },
  {
    "id": "Trip B day 3",
    "route": "Fresno + Clovis, home down the 99",
    "note": "Close the loop, home down the 99.",
    "stops": [
      {
        "name": "Sturdy Products Mfg, Inc.",
        "street": "2030 S. SARAH",
        "city": "Fresno",
        "phone": "559-485-8361",
        "lastOrder": "2024-06-11",
        "revenue": "1001.34",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=2030+S.+SARAH,+FRESNO,+CA"
      },
      {
        "name": "Ally For Pets",
        "street": "2933 E SALEM AVE",
        "city": "Fresno",
        "phone": "559-930-3073",
        "lastOrder": "2024-12-30",
        "revenue": "2796.44",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=2933+E+SALEM+AVE,+FRESNO,+CA"
      },
      {
        "name": "Stephen Fedele, D.C.",
        "street": "6346 N BETHEL AVE",
        "city": "Clovis",
        "phone": "559-229-1700",
        "lastOrder": "2026-02-03",
        "revenue": "30043.88",
        "flags": "warm: ordered 2026; address-level pin, not rooftop",
        "maps": "https://maps.apple.com/?daddr=6346+N+BETHEL+AVE,+CLOVIS,+CA"
      }
    ]
  },
  {
    "id": "Flex",
    "route": "Bishop (Eastern Sierra) - phone first; dedicated 395 run only if it earns it",
    "note": "Phone first. A dedicated 395 run only if the account earns it.",
    "stops": [
      {
        "name": "Blue Lupine",
        "street": "192 W LINE ST",
        "city": "Bishop",
        "phone": "442-228-5000",
        "lastOrder": "2025-10-31",
        "revenue": "15448.42",
        "flags": "",
        "maps": "https://maps.apple.com/?daddr=192+W+LINE+ST,+BISHOP,+CA"
      }
    ]
  }
];
