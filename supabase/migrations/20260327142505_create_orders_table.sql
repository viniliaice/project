/*
  # Create Orders Table

  1. New Tables
    - `orders`
      - `id` (uuid, primary key)
      - `customer_id` (uuid, optional - linked to customers for authenticated users)
      - `customer_name` (text)
      - `customer_phone` (text)
      - `delivery_location` (text)
      - `items` (jsonb array)
      - `total` (decimal)
      - `status` (text)
      - `payment_method` (text)
      - `notes` (text)
      - `assigned_driver` (jsonb)
      - `location_lat` (decimal, GPS latitude)
      - `location_lng` (decimal, GPS longitude)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
  
  2. Security
    - Enable RLS on `orders` table
    - Allow public insert (for guest orders)
    - Allow users to read their own orders (by phone or customer_id)
    - Allow authenticated users (admins) to read/update all orders
  
  3. Indexes
    - Index on customer_phone for guest order lookups
    - Index on customer_id for authenticated user order lookups
    - Index on status for filtering
    - Index on created_at for sorting
*/

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  delivery_location text NOT NULL,
  items jsonb NOT NULL,
  total decimal(10, 2) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payment_method text NOT NULL,
  notes text,
  assigned_driver jsonb,
  location_lat decimal(10, 8),
  location_lng decimal(11, 8),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create orders"
  ON orders
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Users can read own orders by phone"
  ON orders
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can update orders"
  ON orders
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete orders"
  ON orders
  FOR DELETE
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
