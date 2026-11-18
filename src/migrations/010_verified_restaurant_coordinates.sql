-- Exact venue pins checked against matching public place listings; Foodpanda's
-- published structured geocoordinates are used for Bedbox and 4Rs.
-- Kahluts remains unpinned because its saved address conflicts with its cited source.
UPDATE restaurants SET latitude = 16.058418, longitude = 120.3400588
WHERE slug = 'silverios-seafoods' AND (latitude IS NULL OR longitude IS NULL);

UPDATE restaurants SET latitude = 16.019274, longitude = 120.3306496
WHERE slug = 'kuya-max-grill' AND (latitude IS NULL OR longitude IS NULL);

UPDATE restaurants SET latitude = 16.031514, longitude = 120.330035
WHERE slug = 'city-de-luxe' AND (latitude IS NULL OR longitude IS NULL);

UPDATE restaurants SET latitude = 16.0461521, longitude = 120.3492737
WHERE slug = 'gt-dolce-cafe-patisserie' AND (latitude IS NULL OR longitude IS NULL);

UPDATE restaurants SET latitude = 16.0255085, longitude = 120.3270414
WHERE slug = 'black-scoop-cafe-dagupan' AND (latitude IS NULL OR longitude IS NULL);

UPDATE restaurants SET latitude = 16.0228299, longitude = 120.3216537
WHERE slug = 'jeprox-dagupan' AND (latitude IS NULL OR longitude IS NULL);

UPDATE restaurants SET latitude = 16.0197897, longitude = 120.3215716
WHERE slug = 'uson-pigar-pigar' AND (latitude IS NULL OR longitude IS NULL);

UPDATE restaurants SET latitude = 16.0293418, longitude = 120.3284283
WHERE slug = 'los-pedritos-tapuac' AND (latitude IS NULL OR longitude IS NULL);

UPDATE restaurants SET latitude = 16.0317205, longitude = 120.3256552
WHERE slug = 'kainan-ni-mang-peping' AND (latitude IS NULL OR longitude IS NULL);

UPDATE restaurants SET latitude = 16.040227, longitude = 120.3381576
WHERE slug = 'silantro-fil-mex-cantina' AND (latitude IS NULL OR longitude IS NULL);

UPDATE restaurants SET latitude = 16.0466333, longitude = 120.3516454
WHERE slug = 'olivias-pizzeria' AND (latitude IS NULL OR longitude IS NULL);

UPDATE restaurants SET latitude = 16.05295, longitude = 120.3361273
WHERE slug = 'sangkalan-restaurant-dagupan' AND (latitude IS NULL OR longitude IS NULL);

UPDATE restaurants SET latitude = 16.0436375, longitude = 120.3391719
WHERE slug = 'bedbox-flavor-box-dagupan' AND (latitude IS NULL OR longitude IS NULL);

UPDATE restaurants SET latitude = 16.033959, longitude = 120.3302203
WHERE slug = 'sajj-shawarma-dagupan' AND (latitude IS NULL OR longitude IS NULL);

UPDATE restaurants SET latitude = 16.0348226, longitude = 120.3297963
WHERE slug = 'abozayn-dagupan' AND (latitude IS NULL OR longitude IS NULL);

UPDATE restaurants SET latitude = 16.0567626, longitude = 120.3405079
WHERE slug = 'stay-awhile-cafe-bakery' AND (latitude IS NULL OR longitude IS NULL);

UPDATE restaurants SET latitude = 16.0358086, longitude = 120.3294061
WHERE slug = 'cafe-lilom' AND (latitude IS NULL OR longitude IS NULL);

UPDATE restaurants SET latitude = 16.04382539, longitude = 120.34305085
WHERE slug = 'dagupan-pansiteria-4rs-herrero' AND (latitude IS NULL OR longitude IS NULL);

UPDATE restaurants SET latitude = 16.0414198, longitude = 120.3367648
WHERE slug = 'mpc-pigar-pigar-galvan' AND (latitude IS NULL OR longitude IS NULL);

UPDATE restaurants SET latitude = 16.0423625, longitude = 120.3363304
WHERE slug = 'ty-ans-pigar-pigar-galvan' AND (latitude IS NULL OR longitude IS NULL);

UPDATE restaurants SET latitude = 16.0672997, longitude = 120.3351498
WHERE slug = 'simeonas-seafood-bonuan' AND (latitude IS NULL OR longitude IS NULL);

UPDATE restaurants SET latitude = 16.0413397, longitude = 120.3366291
WHERE slug = 'jcv-pigar-pigar-galvan' AND (latitude IS NULL OR longitude IS NULL);

UPDATE restaurants SET latitude = 16.0342266, longitude = 120.3379087
WHERE slug = 'lots-foodhouse-shawarma-burgos' AND (latitude IS NULL OR longitude IS NULL);

UPDATE restaurants SET latitude = 16.0495707, longitude = 120.3417039
WHERE slug = 'rubis-restaurant-arellano' AND (latitude IS NULL OR longitude IS NULL);
