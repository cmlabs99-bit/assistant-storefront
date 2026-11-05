-- Seed catalog. Safe to re-run: upserts on slug.
insert into products (slug, name, description, price_cents, category, tags, image_url, in_stock) values
  ('pour-over-kettle', 'Gooseneck Pour-Over Kettle', 'Precision-spout 1L kettle with a built-in thermometer for controlled pours.', 6500, 'kitchen', '{coffee,kettle,brewing}', 'https://picsum.photos/seed/kettle/600/600', true),
  ('ceramic-dripper', 'Ceramic Coffee Dripper', 'Cone dripper with spiral ribs for even extraction. Fits standard #2 filters.', 2400, 'kitchen', '{coffee,dripper,brewing}', 'https://picsum.photos/seed/dripper/600/600', true),
  ('burr-grinder', 'Conical Burr Grinder', '40 grind settings from espresso to French press. Stepless adjustment.', 14900, 'kitchen', '{coffee,grinder}', 'https://picsum.photos/seed/grinder/600/600', true),
  ('linen-apron', 'Washed Linen Apron', 'Cross-back linen apron in stone grey. Two front pockets.', 5800, 'home', '{apron,linen,kitchen}', 'https://picsum.photos/seed/apron/600/600', true),
  ('walnut-board', 'End-Grain Walnut Cutting Board', 'Hand-finished 18x12 inch board. Oil before first use.', 11000, 'home', '{cutting-board,walnut,wood}', 'https://picsum.photos/seed/board/600/600', true),
  ('cast-iron-skillet', '10-inch Cast Iron Skillet', 'Pre-seasoned skillet that goes from stovetop to oven.', 4200, 'kitchen', '{skillet,cast-iron,cookware}', 'https://picsum.photos/seed/skillet/600/600', true),
  ('wool-throw', 'Merino Wool Throw', 'Lightweight 50x70 inch throw in oatmeal. Machine washable.', 9800, 'home', '{throw,wool,blanket}', 'https://picsum.photos/seed/throw/600/600', true),
  ('desk-lamp', 'Articulating Desk Lamp', 'Three-joint aluminium arm with warm-to-cool dimming.', 8900, 'office', '{lamp,desk,lighting}', 'https://picsum.photos/seed/lamp/600/600', true),
  ('notebook-set', 'Dot-Grid Notebook Set (3)', 'A5 notebooks with 120gsm paper that takes fountain pen ink without bleed.', 1800, 'office', '{notebook,stationery,paper}', 'https://picsum.photos/seed/notebook/600/600', true),
  ('mechanical-keyboard', 'Low-Profile Mechanical Keyboard', '75% layout, hot-swappable switches, USB-C and Bluetooth.', 12900, 'office', '{keyboard,mechanical,desk}', 'https://picsum.photos/seed/keyboard/600/600', true),
  ('canvas-tote', 'Heavyweight Canvas Tote', '18oz canvas tote with interior zip pocket. Holds a 15-inch laptop.', 3600, 'bags', '{tote,canvas,bag}', 'https://picsum.photos/seed/tote/600/600', true),
  ('travel-mug', 'Insulated Travel Mug 16oz', 'Double-wall stainless mug that keeps coffee hot for six hours.', 2800, 'kitchen', '{mug,coffee,travel}', 'https://picsum.photos/seed/mug/600/600', true),
  ('plant-stand', 'Three-Tier Plant Stand', 'Powder-coated steel stand for indoor plants. Assembles without tools.', 7200, 'home', '{plants,stand,decor}', 'https://picsum.photos/seed/plant/600/600', true),
  ('field-jacket', 'Waxed Cotton Field Jacket', 'Water-resistant waxed cotton with corduroy collar. Olive.', 18500, 'apparel', '{jacket,waxed,outerwear}', 'https://picsum.photos/seed/jacket/600/600', true),
  ('wool-socks', 'Merino Hiking Socks (2 pairs)', 'Cushioned merino blend socks with a reinforced heel.', 2600, 'apparel', '{socks,merino,hiking}', 'https://picsum.photos/seed/socks/600/600', true),
  ('leather-wallet', 'Slim Leather Card Wallet', 'Full-grain leather wallet that holds six cards and folded bills.', 4800, 'bags', '{wallet,leather}', 'https://picsum.photos/seed/wallet/600/600', false)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  price_cents = excluded.price_cents,
  category = excluded.category,
  tags = excluded.tags,
  image_url = excluded.image_url,
  in_stock = excluded.in_stock;
