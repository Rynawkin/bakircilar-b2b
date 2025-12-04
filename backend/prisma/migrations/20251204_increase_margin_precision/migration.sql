-- Increase margin precision to DECIMAL(12,2) to handle very high margin percentages
ALTER TABLE price_changes
  ALTER COLUMN margin_list_1 TYPE DECIMAL(12,2),
  ALTER COLUMN margin_list_2 TYPE DECIMAL(12,2),
  ALTER COLUMN margin_list_3 TYPE DECIMAL(12,2),
  ALTER COLUMN margin_list_4 TYPE DECIMAL(12,2),
  ALTER COLUMN margin_list_5 TYPE DECIMAL(12,2),
  ALTER COLUMN margin_list_6 TYPE DECIMAL(12,2),
  ALTER COLUMN margin_list_7 TYPE DECIMAL(12,2),
  ALTER COLUMN margin_list_8 TYPE DECIMAL(12,2),
  ALTER COLUMN margin_list_9 TYPE DECIMAL(12,2),
  ALTER COLUMN margin_list_10 TYPE DECIMAL(12,2),
  ALTER COLUMN change_percent TYPE DECIMAL(12,2);

ALTER TABLE product_price_stats
  ALTER COLUMN current_margin_list_1 TYPE DECIMAL(12,2),
  ALTER COLUMN current_margin_list_2 TYPE DECIMAL(12,2),
  ALTER COLUMN current_margin_list_3 TYPE DECIMAL(12,2),
  ALTER COLUMN current_margin_list_4 TYPE DECIMAL(12,2),
  ALTER COLUMN current_margin_list_5 TYPE DECIMAL(12,2),
  ALTER COLUMN current_margin_list_6 TYPE DECIMAL(12,2),
  ALTER COLUMN current_margin_list_7 TYPE DECIMAL(12,2),
  ALTER COLUMN current_margin_list_8 TYPE DECIMAL(12,2),
  ALTER COLUMN current_margin_list_9 TYPE DECIMAL(12,2),
  ALTER COLUMN current_margin_list_10 TYPE DECIMAL(12,2);
