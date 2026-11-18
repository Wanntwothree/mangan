-- Exact OpenStreetMap venue pins verified from mapped restaurant locations.
UPDATE restaurants
SET latitude = 16.0345605, longitude = 120.3441752
WHERE slug = 'ciudad-elmina';

UPDATE restaurants
SET latitude = 16.0552954, longitude = 120.3374765
WHERE slug = 'matutina-gerrys';

-- Chowking's AB Fernandez Avenue branch, matched by its submitted address.
UPDATE restaurants
SET latitude = 16.0456592, longitude = 120.3420809
WHERE name = 'Chowking'
  AND address LIKE 'AB Fernandez Ave%'
  AND status = 'approved';
