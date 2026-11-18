-- Restore the curated Philippine-peso price ranges on seeded Dagupan listings.
-- Owner-submitted restaurants are never touched: they keep their own prices.
UPDATE restaurants SET price_min = 300, price_max = 600 WHERE slug = 'silverios-seafoods' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 200, price_max = 400 WHERE slug = 'kuya-max-grill' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 100, price_max = 300 WHERE slug = 'city-de-luxe' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 200, price_max = 400 WHERE slug = 'gt-dolce-cafe-patisserie' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 80, price_max = 500 WHERE slug = 'black-scoop-cafe-dagupan' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 200, price_max = 2000 WHERE slug = 'jeprox-dagupan' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 110, price_max = 860 WHERE slug = 'uson-pigar-pigar' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 200, price_max = 500 WHERE slug = 'kahluts-restaurant' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 260, price_max = 550 WHERE slug = 'los-pedritos-tapuac' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 200, price_max = 2000 WHERE slug = 'kainan-ni-mang-peping' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 120, price_max = 1800 WHERE slug = 'silantro-fil-mex-cantina' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 350, price_max = 2000 WHERE slug = 'olivias-pizzeria' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 400, price_max = 600 WHERE slug = 'sangkalan-restaurant-dagupan' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 120, price_max = 750 WHERE slug = 'bedbox-flavor-box-dagupan' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 125, price_max = 850 WHERE slug = 'sajj-shawarma-dagupan' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 140, price_max = 550 WHERE slug = 'abozayn-dagupan' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 150, price_max = 600 WHERE slug = 'stay-awhile-cafe-bakery' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 110, price_max = 400 WHERE slug = 'cafe-lilom' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 150, price_max = 300 WHERE slug = 'dagupan-pansiteria-4rs-herrero' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 200, price_max = 450 WHERE slug = 'mpc-pigar-pigar-galvan' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 230, price_max = 400 WHERE slug = 'ty-ans-pigar-pigar-galvan' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 250, price_max = 1000 WHERE slug = 'simeonas-seafood-bonuan' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 145, price_max = 450 WHERE slug = 'jcv-pigar-pigar-galvan' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 100, price_max = 240 WHERE slug = 'lots-foodhouse-shawarma-burgos' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 150, price_max = 400 WHERE slug = 'rubis-restaurant-arellano' AND owner_id IS NULL;
