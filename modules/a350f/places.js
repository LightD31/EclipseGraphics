/* Where is the A350F? Places for the module's position in words: "à 12 km
   au nord de Mont-de-Marsan (Landes)", "au large d'Arcachon", "au-dessus des
   Pyrénées"… Offline: towns + hand-traced lines.

   Towns: GeoNames (https://www.geonames.org, CC BY 4.0), cities5000,
   south-west France, Andorra and northern Spain, thinned so that each
   sparse area keeps one reference town every ~15 km while the big and
   well-known ones are always there. Coastlines and the Pyrenees crest are
   simplified by hand (a few km of precision: enough to say "au large de").

   window.A350F_WHERE(lat, lon) → { text, sea: 'atlantique' | 'mediterranee' | null }
                                    (null outside the area it knows)
   window.A350F_WHERE.sea(lat, lon) → 'atlantique' | 'mediterranee' | null */
(function () {
  'use strict';
  var DEPTS = ["Allier", "Andorre", "Ariège", "Aude", "Aveyron", "Cantal", "Charente", "Charente-Maritime", "Corrèze", "Creuse", "Deux-Sèvres", "Dordogne", "Espagne", "Gers", "Gironde", "Haute-Garonne", "Haute-Loire", "Haute-Vienne", "Hautes-Pyrénées", "Hérault", "Landes", "Lot", "Lot-et-Garonne", "Lozère", "Puy-de-Dôme", "Pyrénées-Atlantiques", "Pyrénées-Orientales", "Tarn", "Tarn-et-Garonne"];
  // [name, lat, lon, département index, big (≥ 40 000 inhabitants)]
  var TOWNS = [
    ["Biarritz",43.4806,-1.5568,25,0],
    ["Blagnac",43.6367,1.3897,15,0],
    ["Royan",45.6281,-1.0315,7,0],
    ["Lourdes",43.0946,-0.0461,18,0],
    ["Saint-Jean-de-Luz",43.3887,-1.6627,25,0],
    ["Hendaye",43.3581,-1.7744,25,0],
    ["Arcachon",44.6613,-1.1725,14,0],
    ["Capbreton",43.6424,-1.4312,20,0],
    ["Toulouse",43.6043,1.4437,15,1],
    ["Bordeaux",44.8412,-0.5805,14,1],
    ["Vitoria",42.85,-2.6727,12,1],
    ["Pampelune",42.8169,-1.6432,12,1],
    ["Saint-Sébastien",43.3128,-1.975,12,1],
    ["Logroño",42.4661,-2.4512,12,1],
    ["Clermont-Ferrand",45.7797,3.0868,24,1],
    ["Limoges",45.8336,1.2476,17,1],
    ["Perpignan",42.6976,2.8954,26,1],
    ["Gérone",41.9831,2.8249,12,1],
    ["Pau",43.3112,-0.3558,25,1],
    ["La Rochelle",46.1631,-1.1522,7,1],
    ["Béziers",43.3412,3.214,19,1],
    ["Mérignac",44.8425,-0.6451,14,1],
    ["Pessac",44.8056,-0.6324,14,1],
    ["Niort",46.3231,-0.4588,10,1],
    ["Huesca",42.1362,-0.4087,12,1],
    ["Brive-la-Gaillarde",45.1589,1.5333,8,1],
    ["Montauban",44.0176,1.3542,28,1],
    ["Albi",43.9298,2.148,27,1],
    ["Tarbes",43.2341,0.0714,18,1],
    ["Narbonne",43.184,3.0014,3,1],
    ["Carcassonne",43.2165,2.3486,3,1],
    ["Angoulême",45.65,0.1535,6,1],
    ["Castres",43.6053,2.2409,27,1],
    ["Figueras",42.2664,2.9616,12,1],
    ["Montluçon",46.3402,2.6025,0,1],
    ["Bayonne",43.4932,-1.473,25,1],
    ["Sète",43.4028,3.6928,19,1],
    ["Vic",41.9301,2.2549,12,0],
    ["Mont-de-Marsan",43.8902,-0.4971,20,0],
    ["Périgueux",45.1869,0.7144,11,0],
    ["Aurillac",44.9254,2.4398,5,0],
    ["Tudela",42.0617,-1.6045,12,0],
    ["Agen",44.202,0.6206,22,0],
    ["Olot",42.181,2.4901,12,0],
    ["Saintes",45.7474,-0.6349,7,0],
    ["Rochefort",45.943,-0.9677,7,0],
    ["Rodez",44.3526,2.5734,4,0],
    ["Bergerac",44.8516,0.4817,11,0],
    ["Durango",43.1712,-2.6338,12,0],
    ["Vichy",46.1271,3.4258,0,0],
    ["Villeneuve-sur-Lot",44.4085,0.7042,22,0],
    ["Calahorra",42.3051,-1.9652,12,0],
    ["Auch",43.6456,0.5886,13,0],
    ["Muret",43.46,1.3254,15,0],
    ["Libourne",44.9145,-0.2419,14,0],
    ["Cahors",44.4491,1.4366,21,0],
    ["Millau",44.0997,3.0785,4,0],
    ["Agde",43.3108,3.4758,19,0],
    ["Zarautz",43.2844,-2.1699,12,0],
    ["Palafrugell",41.9174,3.1631,12,0],
    ["Dax",43.7103,-1.0537,20,0],
    ["Arrasate",43.0644,-2.4898,12,0],
    ["Cognac",45.6958,-0.3287,6,0],
    ["Andorre-la-Vieille",42.5078,1.5211,1,0],
    ["Roses",42.262,3.1769,12,0],
    ["Marmande",44.5036,0.1655,22,0],
    ["Tolosa",43.1348,-2.078,12,0],
    ["Ejea de los Caballeros",42.1263,-1.1372,12,0],
    ["Berga",42.1043,1.8463,12,0],
    ["Monzón",41.9108,0.1941,12,0],
    ["Pamiers",43.1165,1.6108,2,0],
    ["Tulle",45.2658,1.7723,8,0],
    ["Gernika-Lumo",43.3167,-2.6833,12,0],
    ["Issoire",45.5442,3.249,24,0],
    ["Guéret",46.1718,1.8717,9,0],
    ["Mende",44.5216,3.4998,23,0],
    ["Estella-Lizarra",42.6718,-2.0323,12,0],
    ["Villefranche-de-Rouergue",44.3517,2.037,4,0],
    ["Thiers",45.8565,3.5476,24,0],
    ["Moissac",44.1045,1.0847,28,0],
    ["Jaca",42.569,-0.5499,12,0],
    ["Graulhet",43.7669,1.9894,27,0],
    ["Oloron-Sainte-Marie",43.1944,-0.6107,25,0],
    ["Gaillac",43.9016,1.8969,27,0],
    ["Castelnaudary",43.3181,1.9534,3,0],
    ["Saint-Gaudens",43.1081,0.7232,15,0],
    ["La Seu d'Urgell",42.3588,1.4614,12,0],
    ["Orthez",43.4883,-0.7727,25,0],
    ["Saint-Junien",45.8875,0.9016,17,0],
    ["Figeac",44.6089,2.0316,21,0],
    ["Mazamet",43.4928,2.3736,27,0],
    ["Tafalla",42.5269,-1.6745,12,0],
    ["Ussel",45.548,2.3092,8,0],
    ["Azkoitia",43.1774,-2.3113,12,0],
    ["Tarazona",41.9047,-1.7268,12,0],
    ["Sarlat-la-Canéda",44.889,1.2166,11,0],
    ["Ripoll",42.2006,2.1903,12,0],
    ["Limoux",43.0549,2.2217,3,0],
    ["Biscarrosse",44.3945,-1.1672,20,0],
    ["Sabiñánigo",42.5192,-0.3661,12,0],
    ["Lavaur",43.6989,1.8121,27,0],
    ["Argelès-sur-Mer",42.5471,3.0225,26,0],
    ["Foix",42.9654,1.6071,2,0],
    ["Tonneins",44.3948,0.3101,22,0],
    ["Alfaro",42.1803,-1.7502,12,0],
    ["Ondarroa",43.3167,-2.4167,12,0],
    ["Lézignan-Corbières",43.2009,2.7574,3,0],
    ["Bagnères-de-Bigorre",43.065,0.1488,18,0],
    ["Puigcerdà",42.4316,1.9282,12,0],
    ["L'Isle-Jourdain",43.6122,1.0866,13,0],
    ["Revel",43.4589,2.0044,15,0],
    ["Pézenas",43.46,3.4226,19,0],
    ["Saint-Affrique",43.9558,2.8891,4,0],
    ["Solsona",41.9939,1.5171,12,0],
    ["Céret",42.4853,2.748,26,0],
    ["Mourenx",43.3703,-0.6299,25,0],
    ["Saint-Yrieix-la-Perche",45.5145,1.2033,17,0],
    ["Condom",43.9582,0.372,13,0],
    ["Nérac",44.136,0.3384,22,0],
    ["Coutras",45.0407,-0.1289,14,0],
    ["Lodève",43.7318,3.3196,19,0],
    ["Saint-Flour",45.0337,3.093,5,0],
    ["Brioude",45.2942,3.3842,16,0],
    ["Altsasu",42.9,-2.1652,12,0],
    ["Lavelanet",42.9327,1.8484,2,0],
    ["Auterive",43.3508,1.4746,15,0],
    ["Tauste",41.918,-1.2534,12,0],
    ["Decazeville",44.5605,2.2509,4,0],
    ["Langon",44.5528,-0.2499,14,0],
    ["Saint-Jean-d'Angély",45.9441,-0.5213,7,0],
    ["Saint-Girons",42.9849,1.1459,2,0],
    ["Bédarieux",43.616,3.1589,19,0],
    ["Prades",42.6176,2.4218,26,0],
    ["Saint-Pierre-d'Oléron",45.9437,-1.3059,7,0],
    ["Lannemezan",43.1252,0.384,18,0],
    ["Mimizan",44.2013,-1.2287,20,0],
    ["Fleurance",43.8494,0.663,13,0],
    ["Grenade",43.7713,1.2928,15,0],
    ["Terrasson-Lavilledieu",45.1301,1.3014,11,0],
    ["Caussade",44.1613,1.5369,28,0],
    ["Hasparren",43.3839,-1.3052,25,0],
    ["Aire-sur-l'Adour",43.7025,-0.2628,20,0],
    ["Gannat",46.0999,3.1984,0,0],
    ["Marvejols",44.5543,3.2904,23,0],
    ["Port-la-Nouvelle",43.0183,3.0499,3,0],
    ["Surgères",46.1081,-0.7514,7,0],
    ["Fumel",44.499,0.9673,22,0],
    ["Pauillac",45.2002,-0.7488,14,0],
    ["Montpon-Ménestérol",45.0096,0.1592,11,0],
    ["Tremp",42.167,0.8949,12,0],
    ["Villemur-sur-Tarn",43.8671,1.5028,15,0],
    ["Saint-Pourçain-sur-Sioule",46.3075,3.2893,0,0],
    ["Ille-sur-Têt",42.6708,2.6207,26,0],
    ["Lesparre-Médoc",45.3071,-0.9379,14,0],
    ["Vielha",42.702,0.7956,12,0],
    ["Vic-en-Bigorre",43.3868,0.0547,18,0],
    ["Gourdon",44.7358,1.3807,21,0],
    ["Égletons",45.4064,2.0452,8,0],
    ["La Souterraine",46.2379,1.486,9,0],
    ["Cardona",41.9137,1.6785,12,0],
    ["Barbezieux-Saint-Hilaire",45.4727,-0.1522,6,0],
    ["Pons",45.5802,-0.5481,7,0],
    ["Casteljaloux",44.3147,0.0877,22,0],
    ["Sangüesa",42.5748,-1.2828,12,0],
    ["Marennes",45.8227,-1.1051,7,0],
    ["Gignac",43.6521,3.551,19,0],
    ["Ambazac",45.9573,1.3998,17,0],
    ["Mios",44.6056,-0.9372,14,0]
  ];
  // Atlantic coast, south to north (lon at a given lat): west of it is sea
  var ATLANTIC = [[43.372, -1.790], [43.388, -1.663], [43.483, -1.566], [43.527, -1.524], [43.645, -1.446],
                  [43.790, -1.408], [44.000, -1.350], [44.212, -1.295], [44.444, -1.254], [44.560, -1.245],
                  [44.640, -1.262], [44.800, -1.230], [45.000, -1.200], [45.300, -1.160], [45.510, -1.130],
                  [45.570, -1.065], [45.620, -1.030], [45.690, -1.190], [45.800, -1.230], [45.900, -1.360],
                  [46.050, -1.410], [46.300, -1.450]];
  // Basque / Cantabrian coast, west to east (lat at a given lon): north of it is sea
  var CANTABRIAN = [[-4.00, 43.45], [-3.50, 43.45], [-3.00, 43.38], [-2.50, 43.38], [-2.20, 43.30],
                    [-1.98, 43.325], [-1.79, 43.372]];
  // Mediterranean coast (Golfe du Lion), south to north (lon at a given lat): east of it is sea
  var MEDITERRANEAN = [[42.44, 3.17], [42.53, 3.08], [42.70, 3.04], [42.87, 3.05], [43.10, 3.11],
                       [43.25, 3.30], [43.33, 3.50], [43.40, 3.70], [43.53, 3.95]];
  // Pyrenees main crest, west to east (lat at a given lon)
  var CREST = [[-1.75, 43.28], [-1.45, 43.10], [-1.00, 42.99], [-0.72, 42.95], [-0.52, 42.80], [-0.15, 42.77],
               [0.15, 42.70], [0.66, 42.63], [1.00, 42.75], [1.45, 42.60], [1.95, 42.47], [2.45, 42.47],
               [2.86, 42.46], [3.17, 42.44]];
  var BASSIN = [44.69, -1.13]; // bassin d'Arcachon
  var LFBO = [43.6291, 1.3638];

  var RAD = Math.PI / 180;
  function km(aLat, aLon, bLat, bLon) {
    var dLat = (bLat - aLat) * RAD, dLon = (bLon - aLon) * RAD;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  // piecewise-linear y(x) along a polyline sorted on x (null outside it)
  function along(line, x) {
    if (x < line[0][0] || x > line[line.length - 1][0]) return null;
    for (var i = 1; i < line.length; i++) {
      if (x <= line[i][0]) {
        var a = line[i - 1], b = line[i], u = (x - a[0]) / (b[0] - a[0] || 1);
        return a[1] + (b[1] - a[1]) * u;
      }
    }
    return null;
  }
  // French elision: "d'Arcachon", "du Mans", "des Sables", "de Pau"
  function de(name) {
    if (/^Le /.test(name)) return 'du ' + name.slice(3);
    if (/^Les /.test(name)) return 'des ' + name.slice(4);
    if (/^[AEIOUYÉÈÊÂÎHaeiouyéèêâîh]/.test(name)) return 'd\'' + name;
    return 'de ' + name;
  }
  var DIRS = ['au nord', 'au nord-est', 'à l\'est', 'au sud-est', 'au sud', 'au sud-ouest', 'à l\'ouest', 'au nord-ouest'];
  function bearing(aLat, aLon, bLat, bLon) {
    var y = Math.sin((bLon - aLon) * RAD) * Math.cos(bLat * RAD);
    var x = Math.cos(aLat * RAD) * Math.sin(bLat * RAD) - Math.sin(aLat * RAD) * Math.cos(bLat * RAD) * Math.cos((bLon - aLon) * RAD);
    return (Math.atan2(y, x) / RAD + 360) % 360;
  }
  // The town to name: the nearest, unless a big one is nearly as close
  function reference(lat, lon, filter) {
    var best = null, bestBig = null;
    TOWNS.forEach(function (t) {
      if (filter && !filter(t)) return;
      var d = km(lat, lon, t[1], t[2]);
      if (!best || d < best.d) best = { t: t, d: d };
      if (t[4] && (!bestBig || d < bestBig.d)) bestBig = { t: t, d: d };
    });
    if (best && bestBig && bestBig.d <= Math.max(4, best.d * 1.5) && bestBig.d < 25) return bestBig;
    return best;
  }
  function relative(ref, lat, lon) {
    var t = ref.t, dept = DEPTS[t[3]];
    var tail = dept === 'Andorre' ? '' : ' (' + dept + ')';
    if (ref.d < 4) return 'au-dessus ' + de(t[0]) + tail;
    return 'à ' + Math.round(ref.d) + ' km ' + DIRS[Math.round(bearing(t[1], t[2], lat, lon) / 45) % 8] + ' ' + de(t[0]) + tail;
  }
  function onCoast(line, latKey) {
    return function (t) {
      var c = along(line, latKey ? t[1] : t[2]);
      return c != null && Math.abs((latKey ? t[2] : t[1]) - c) < 0.12;
    };
  }
  function seaOf(lat, lon) {
    var a = along(ATLANTIC, lat);
    if (a != null && lon < a - 0.01) return 'atlantique';
    var c = along(CANTABRIAN, lon);
    if (c != null && lat > c + 0.01) return 'atlantique';
    var m = along(MEDITERRANEAN, lat);
    if (m != null && lon > m + 0.01) return 'mediterranee';
    return null;
  }

  window.A350F_WHERE = function (lat, lon) {
    if (km(lat, lon, LFBO[0], LFBO[1]) < 3) return { text: 'sur l\'aéroport de Toulouse-Blagnac', sea: null };
    var sea = seaOf(lat, lon);
    if (sea) {
      var ref = reference(lat, lon, sea === 'atlantique' ? function (t) { return onCoast(ATLANTIC, true)(t) || onCoast(CANTABRIAN, false)(t); }
                                                         : onCoast(MEDITERRANEAN, true));
      var name = sea === 'atlantique' ? 'l\'océan Atlantique' : 'la Méditerranée';
      if (!ref) return { text: 'au-dessus de ' + name, sea: sea };
      if (ref.d < 40) return { text: 'au large ' + de(ref.t[0]), sea: sea };
      return { text: 'au-dessus de ' + name + ', à ' + Math.round(ref.d) + ' km ' + de(ref.t[0]), sea: sea };
    }
    if (km(lat, lon, BASSIN[0], BASSIN[1]) < 8) return { text: 'au-dessus du bassin d\'Arcachon', sea: null };
    var crest = along(CREST, lon);
    if (crest != null && Math.abs(lat - crest) * 111 < 25) {
      var r = reference(lat, lon);
      return { text: 'au-dessus des Pyrénées, ' + (r.d < 8 ? 'près ' + de(r.t[0]) : relative(r, lat, lon)), sea: null };
    }
    var ref2 = reference(lat, lon);
    if (!ref2 || ref2.d > 60) return null; // outside the area this knows
    return { text: relative(ref2, lat, lon), sea: null };
  };
  // the cheap part alone: which sea, if any, is under this point
  window.A350F_WHERE.sea = seaOf;
})();
