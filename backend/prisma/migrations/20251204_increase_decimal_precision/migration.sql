-- Increase DECIMAL precision to handle larger price values (up to 999,999,999.99)

ALTER TABLE price_changes
  ALTER COLUMN old_price TYPE DECIMAL(12,2),
  ALTER COLUMN new_price TYPE DECIMAL(12,2),
  ALTER COLUMN change_amount TYPE DECIMAL(12,2),
  ALTER COLUMN current_cost TYPE DECIMAL(12,2),
  ALTER COLUMN price_list_1 TYPE DECIMAL(12,2),
  ALTER COLUMN price_list_2 TYPE DECIMAL(12,2),
  ALTER COLUMN price_list_3 TYPE DECIMAL(12,2),
  ALTER COLUMN price_list_4 TYPE DECIMAL(12,2),
  ALTER COLUMN price_list_5 TYPE DECIMAL(12,2),
  ALTER COLUMN price_list_6 TYPE DECIMAL(12,2),
  ALTER COLUMN price_list_7 TYPE DECIMAL(12,2),
  ALTER COLUMN price_list_8 TYPE DECIMAL(12,2),
  ALTER COLUMN price_list_9 TYPE DECIMAL(12,2),
  ALTER COLUMN price_list_10 TYPE DECIMAL(12,2);

ALTER TABLE product_price_stats
  ALTER COLUMN current_cost TYPE DECIMAL(12,2),
  ALTER COLUMN current_price_list_1 TYPE DECIMAL(12,2),
  ALTER COLUMN current_price_list_2 TYPE DECIMAL(12,2),
  ALTER COLUMN current_price_list_3 TYPE DECIMAL(12,2),
  ALTER COLUMN current_price_list_4 TYPE DECIMAL(12,2),
  ALTER COLUMN current_price_list_5 TYPE DECIMAL(12,2),
  ALTER COLUMN current_price_list_6 TYPE DECIMAL(12,2),
  ALTER COLUMN current_price_list_7 TYPE DECIMAL(12,2),
  ALTER COLUMN current_price_list_8 TYPE DECIMAL(12,2),
  ALTER COLUMN current_price_list_9 TYPE DECIMAL(12,2),
  ALTER COLUMN current_price_list_10 TYPE DECIMAL(12,2);
