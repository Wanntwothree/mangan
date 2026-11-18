-- Estimated Philippine-peso ranges for the remaining curated listings that
-- previously showed "Contact venue". Only seeded rows are updated; prices
-- submitted by restaurant owners are never overwritten.
UPDATE restaurants SET price_min = 220, price_max = 520 WHERE slug = 'house-of-bangus' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 250, price_max = 650 WHERE slug = 'ciudad-elmina' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 200, price_max = 600 WHERE slug = 'matutina-gerrys' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 250, price_max = 700 WHERE slug = 'jacobos-seafood-grill' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 80, price_max = 250 WHERE slug = 'caffe-angelito' AND owner_id IS NULL;
UPDATE restaurants SET price_min = 120, price_max = 350 WHERE slug = 'siblings-home-of-comfort-food' AND owner_id IS NULL;
