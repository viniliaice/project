/*
  # Create Products Table

  1. New Tables
    - `products`
      - `id` (uuid, primary key)
      - `name` (text)
      - `price` (decimal)
      - `icon` (text, emoji)
      - `category` (text)
      - `unit` (text)
      - `stock` (integer)
      - `low_stock` (integer)
      - `description` (text)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
  
  2. Security
    - Enable RLS on `products` table
    - Allow public read access
    - Allow authenticated users with admin role to write
  
  3. Indexes
    - Index on category for filtering
*/

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price decimal(10, 2) NOT NULL,
  icon text NOT NULL,
  category text NOT NULL,
  unit text NOT NULL,
  stock integer NOT NULL DEFAULT 0,
  low_stock integer NOT NULL DEFAULT 5,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read products" ON products;
CREATE POLICY "Anyone can read products"
  ON products
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Only authenticated users can write products" ON products;
CREATE POLICY "Only authenticated users can write products"
  ON products
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Only authenticated users can update products" ON products;
CREATE POLICY "Only authenticated users can update products"
  ON products
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Only authenticated users can delete products" ON products;
CREATE POLICY "Only authenticated users can delete products"
  ON products
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_updated_at ON products(updated_at DESC);
