// Employer search targets checked against local directories on 19 September 2026.
// A directory entry is a place to search, not evidence of a current vacancy.
export const LOCAL_EMPLOYER_GROUPS = [
  {
    name: 'Crescent Shopping Centre',
    source: 'https://crescentshoppingcentre.ie/store_categories/all-stores/',
    employers: [
      'Three', 'An Post', 'Art and Hobby', 'Bookstation', 'BBs Coffee Muffins',
      'Boston Barber', 'Butlers Chocolate Cafe', 'Carraig Donn', 'Cherish Jewellers',
      'CeX', 'Claires Accessories', 'Diesel', 'EBS', 'Eir', 'Franklins', 'Fields Jewellers',
      'Greenes Shoes', 'Gerard Ladies Fashions', 'Ginos Gelato', 'Gym Coffee',
      'Hale Vaping', 'HMV', 'Holland Barrett', 'Intersport Elverys', 'Jack Jones',
      'Krispy Kreme', 'Limerick Library', 'Life Style Sports', 'Lock Doctor',
      'McCabes Pharmacy', 'Milano', 'Morrisseys Butchers', 'Nandos', 'Natures Hand',
      'Neville Jewellers', 'Newbridge Silverware', 'OBriens Sandwich Bar', 'Omniplex',
      'Paco', 'Pair Mobile', 'Parfois', 'Peter Mark', 'Quigleys', 'Regatta', 'Schuh',
      'Select', 'Selected Homme', 'Shake Dog', 'Shaws', 'Sky', 'Smiggle', 'Specsavers',
      'Sugar Dolls', 'Superdry', 'Tailor of Blue', 'The Card Company', 'The Perfume Shop',
      'Therapie Clinic', 'Tommy Hilfiger', 'TUI', 'Velvet Beauty Salon', 'Vila',
      'Vodafone', 'Wonder World', 'Zumo',
    ],
  },
  {
    name: 'Castletroy Town Centre',
    source: 'https://castletroytowncentre.com/store-directory/',
    employers: [
      'Meadows Byrne', 'Shields Dental', 'Lloyds Pharmacy', 'ODEON', 'Henshin',
      'Bliss Beauty', 'Hugh Campbell', 'Flanagan Barbers', 'RAIN Africa',
      'By Design A Local Story', 'Fern Bear', 'Puzzle', 'Secret Garden Flowers',
      'Dargan Healthstore', 'Mr Duffys Sweet Shop', 'Talking Leaves Bookstore',
      'Underwater World', 'Hook Ladder', 'Sandwich Sisters', 'Bella Italia',
      'Coqbull', 'La Patisserie', 'Yogorino', 'Cherryblossom', 'The Dance Academy',
      'VapourPal', 'Embody Fitness', 'Tech Star', 'Hangers Dry Cleaners', 'The Bike Hub',
    ],
  },
  {
    name: 'Parkway Shopping Centre and Retail Park',
    source: 'https://www.parkwaysc.com/our-stores',
    employers: [
      'Cafe Sol', 'Canteen Asian', 'Card Factory', 'Chatori', 'Chemist Warehouse',
      'Clarks', 'FBD Insurance', 'Half Price Ink', 'NDLS', 'Oscar Co', 'OBriens Wines',
      'Shoe Rack', 'The Angel Nails', 'Zee Tech', 'Eliza Studio', 'Decathlon',
      'Currys', 'Dreams', 'Sofa Time', 'Home Focus', 'Camile',
    ],
  },
  {
    name: 'Arthurs Quay',
    source: 'https://arthursquay.ie/retail-stores/',
    employers: [
      'Babyland', 'Just Split', 'Crystal Valet', 'Lyca Mobile', 'Fone Connection',
      'Berti Boutique', 'Gourmandises Time', 'Threads Beauty', 'EuroGiant',
      'Craghoppers', 'New York Barbers', 'Cats Hair Salon', 'Irish Handcrafts',
      'FunTech', 'Quay News', 'Paddywagon', 'Jump Juice', 'OHehirs Bakery',
    ],
  },
  {
    name: 'City, hospitality and campus searches',
    source: 'https://theoldquartergroup.ie/apply-now/',
    // Broader named search targets; search results must establish an actual job.
    employers: [
      'The Old Quarter', 'Fordes Courtyard', 'The Top House', 'Marco Polo',
      'Cornstore', 'The Curragower', 'The Locke Bar', 'The SpitJack', 'The Buttery',
      'Caffe Nero', 'Esquires', 'Boojum', 'Burger King', 'Dominos', 'Papa Johns',
      'Chawkes', 'Amber', 'Londis', 'EUROSPAR', 'Petmania', 'Maxi Zoo', 'Petstop',
      'University of Limerick', 'UL Sport', 'University Concert Hall', 'Unijobs',
      'The Pavilion', 'Campus Life Services', 'Technological University Shannon',
      'Maldron Hotel', 'Clayton Hotel', 'Absolute Hotel', 'The Savoy Hotel',
      'The George Hotel', 'The Bedford', 'Kilmurry Lodge Hotel', 'Radisson Blu Limerick',
      'Dunraven Arms', 'Adare Manor', 'Great National South Court Hotel',
      'The Greenhills Hotel', 'Castletroy Golf Club', 'PharmacyStore',
      'McCauley Pharmacy', 'Boots Opticians', 'The Lunch Bag', 'Noel Group',
      'Excel Recruitment', 'Bidvest Noonan', 'Derrycourt', 'Mitie', 'G4S',
      'Brook Foods', 'BaxterStorey', 'Compass Group', 'Three Q Recruitment',
    ],
  },
]
export const LOCAL_SHOPS = [...new Set(LOCAL_EMPLOYER_GROUPS.flatMap(g => g.employers))]
