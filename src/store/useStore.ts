import { useState, useEffect, useCallback } from 'react';
import { Product, CartItem, Order, OrderStatus, OrderItem } from '../types';
import { initialProducts } from '../data/products';
import { supabase } from '../lib/supabase';

export function useStore() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [newOrders, setNewOrders] = useState<string[]>([]);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeStore = async () => {
      try {
        const { data, error } = await supabase.from('products').select('*');

        if (error) throw error;

        if (!data || data.length === 0) {
          await supabase.from('products').insert(
            initialProducts.map(p => ({
              name: p.name,
              price: p.price,
              icon: p.icon,
              category: p.category,
              unit: p.unit,
              stock: p.stock,
              low_stock: p.lowStock,
              description: p.description || '',
            }))
          );
          const { data: newProducts } = await supabase.from('products').select('*');
          setProducts(newProducts || []);
        } else {
          setProducts(data);
        }

        const { data: ordersData } = await supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false });

        if (ordersData) {
          setOrders(ordersData.map(order => ({
            id: order.id,
            customerName: order.customer_name,
            customerPhone: order.customer_phone,
            deliveryLocation: order.delivery_location,
            items: order.items,
            total: order.total,
            status: order.status,
            paymentMethod: order.payment_method,
            notes: order.notes || '',
            assignedDriver: order.assigned_driver,
            createdAt: order.created_at,
          })));
        }
      } catch (error) {
        console.error('Error initializing store:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeStore();

    const subscription = supabase
      .channel('products')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setProducts(prev => [...prev, payload.new]);
        } else if (payload.eventType === 'UPDATE') {
          setProducts(prev => prev.map(p => p.id === payload.new.id ? payload.new : p));
        } else if (payload.eventType === 'DELETE') {
          setProducts(prev => prev.filter(p => p.id !== payload.old.id));
        }
      })
      .subscribe();

    const ordersSubscription = supabase
      .channel('orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        console.debug('[useStore] orders subscription payload:', payload);
        if (payload.eventType === 'INSERT') {
          const newOrder = payload.new;
          setOrders(prev => [{
            id: newOrder.id,
            customerName: newOrder.customer_name,
            customerPhone: newOrder.customer_phone,
            deliveryLocation: newOrder.delivery_location,
            items: newOrder.items,
            total: newOrder.total,
            status: newOrder.status,
            paymentMethod: newOrder.payment_method,
            notes: newOrder.notes || '',
            assignedDriver: newOrder.assigned_driver,
            createdAt: newOrder.created_at,
          }, ...prev]);
          // Mark as new and notify admin users via the Browser Notification API + in-app event
          setNewOrders(prev => {
            if (prev.includes(newOrder.id)) return prev;
            return [newOrder.id, ...prev];
          });
          // dispatch in-app event so UI can show toast or other indicator
          try {
            window.dispatchEvent(new CustomEvent('grocery:new-order', { detail: { id: newOrder.id, customerName: newOrder.customer_name, total: newOrder.total } }));
          } catch (_) {}

          // play short beep using Web Audio
          try {
            if (typeof window !== 'undefined' && typeof AudioContext !== 'undefined') {
              const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
              const o = ctx.createOscillator();
              const g = ctx.createGain();
              o.type = 'sine';
              o.frequency.value = 880;
              g.gain.value = 0.05;
              o.connect(g);
              g.connect(ctx.destination);
              o.start();
              setTimeout(() => { o.stop(); ctx.close(); }, 120);
            }
          } catch (_) {}

          // Notify via Notification API if admin (existing logic)
          (async () => {
            try {
              if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
              const { data: sessionData } = await supabase.auth.getSession();
              const authUser = sessionData?.session?.user;
              if (!authUser) return;

              const { data: custData } = await supabase.from('customers').select('is_admin').eq('id', authUser.id).single();
              if (!custData || !custData.is_admin) return;

              if (Notification.permission === 'default') {
                await Notification.requestPermission();
              }

              if (Notification.permission === 'granted') {
                const title = 'New Order Received';
                const body = `${newOrder.customer_name} — $${(newOrder.total || 0).toFixed(2)}`;
                try {
                  // eslint-disable-next-line no-new
                  new Notification(title, { body, tag: newOrder.id });
                } catch (err) {
                  // Notification may fail silently in some environments
                  console.warn('Notification failed:', err);
                }
              }
            } catch (err) {
              console.error('Error checking admin or sending notification:', err);
            }
          })();
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new;
          setOrders(prev => prev.map(o => o.id === updated.id ? {
            id: updated.id,
            customerName: updated.customer_name,
            customerPhone: updated.customer_phone,
            deliveryLocation: updated.delivery_location,
            items: updated.items,
            total: updated.total,
            status: updated.status,
            paymentMethod: updated.payment_method,
            notes: updated.notes || '',
            assignedDriver: updated.assigned_driver,
            createdAt: updated.created_at,
          } : o));
        }
      })
      .subscribe();
    ordersSubscription.on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
      console.debug('[useStore] ordersSubscription active');
    });

    return () => {
      subscription.unsubscribe();
      ordersSubscription.unsubscribe();
    };
  }, []);

  const addToCart = useCallback((product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return prev;
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity < 1) {
      removeFromCart(productId);
      return;
    }
    setCart(prev =>
      prev.map(item =>
        item.product.id === productId
          ? { ...item, quantity: Math.min(quantity, item.product.stock) }
          : item
      )
    );
  }, [removeFromCart]);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const getCartTotal = useCallback(() => {
    return cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  }, [cart]);

  const getCartItemCount = useCallback(() => {
    return cart.reduce((count, item) => count + item.quantity, 0);
  }, [cart]);

  const placeOrder = useCallback(async (customerData: {
    name: string;
    phone: string;
    location: string;
    notes: string;
    paymentMethod: 'cash' | 'telebirr';
  }) => {
    const items = cart.map(item => ({
      productId: item.product.id,
      name: item.product.name,
      price: item.product.price,
      icon: item.product.icon,
      quantity: item.quantity,
      stock: item.product.stock,
    }));

    // include customer_id when a user is signed in
    const { data: sessionData } = await supabase.auth.getSession();
    const authUser = sessionData?.session?.user;

    const insertPayload: any = {
      customer_name: customerData.name,
      customer_phone: customerData.phone,
      delivery_location: customerData.location,
      items,
      total: getCartTotal(),
      status: 'pending',
      payment_method: customerData.paymentMethod,
      notes: customerData.notes,
    };

    if (authUser && authUser.id) {
      insertPayload.customer_id = authUser.id;
    }

    const { data, error } = await supabase
      .from('orders')
      .insert(insertPayload)
      .select()
      .single();

    if (error) throw error;

    const newOrder: Order = {
      id: data.id,
      customerName: data.customer_name,
      customerPhone: data.customer_phone,
      deliveryLocation: data.delivery_location,
      items: data.items,
      total: data.total,
      status: data.status,
      paymentMethod: data.payment_method,
      notes: data.notes || '',
      assignedDriver: data.assigned_driver,
      createdAt: data.created_at,
    };

    setLastOrder(newOrder);
    clearCart();

    return data.id;
  }, [cart, getCartTotal, clearCart]);

  const updateOrderStatus = useCallback(async (orderId: string, status: OrderStatus) => {
    // Optimistic update
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
    const { error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId);

    if (error) {
      // rollback on error
      await (async () => {
        const { data: fresh } = await supabase.from('orders').select('*').eq('id', orderId).single();
        if (fresh) {
          setOrders(prev => prev.map(o => o.id === orderId ? {
            id: fresh.id,
            customerName: fresh.customer_name,
            customerPhone: fresh.customer_phone,
            deliveryLocation: fresh.delivery_location,
            items: fresh.items,
            total: fresh.total,
            status: fresh.status,
            paymentMethod: fresh.payment_method,
            notes: fresh.notes || '',
            assignedDriver: fresh.assigned_driver,
            createdAt: fresh.created_at,
          } : o));
        }
      })();
      throw error;
    }
  }, []);

  const updateOrderNotes = useCallback(async (orderId: string, notes: string) => {
    const { error } = await supabase
      .from('orders')
      .update({ notes })
      .eq('id', orderId);

    if (error) throw error;
  }, []);

  const assignDriver = useCallback(async (orderId: string, driverName: string, driverPhone: string) => {
    // Optimistic update
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, assignedDriver: { name: driverName, phone: driverPhone } } : o));
    const { error } = await supabase
      .from('orders')
      .update({ assigned_driver: { name: driverName, phone: driverPhone } })
      .eq('id', orderId);

    if (error) {
      // rollback: refetch order
      const { data: fresh } = await supabase.from('orders').select('*').eq('id', orderId).single();
      if (fresh) {
        setOrders(prev => prev.map(o => o.id === orderId ? {
          id: fresh.id,
          customerName: fresh.customer_name,
          customerPhone: fresh.customer_phone,
          deliveryLocation: fresh.delivery_location,
          items: fresh.items,
          total: fresh.total,
          status: fresh.status,
          paymentMethod: fresh.payment_method,
          notes: fresh.notes || '',
          assignedDriver: fresh.assigned_driver,
          createdAt: fresh.created_at,
        } : o));
      }
      throw error;
    }
  }, []);

  const addProduct = useCallback(async (product: Omit<Product, 'id'>) => {
    const { data, error } = await supabase
      .from('products')
      .insert({
        name: product.name,
        price: product.price,
        icon: product.icon,
        category: product.category,
        unit: product.unit,
        stock: product.stock,
        low_stock: product.lowStock,
        description: product.description || '',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }, []);

  const updateProduct = useCallback(async (id: string, updates: Partial<Product>) => {
    const { error } = await supabase
      .from('products')
      .update({
        name: updates.name,
        price: updates.price,
        icon: updates.icon,
        category: updates.category,
        unit: updates.unit,
        stock: updates.stock,
        low_stock: updates.lowStock,
        description: updates.description,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;
  }, []);

  const deleteProduct = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }, []);

  const updateStock = useCallback(async (id: string, quantity: number) => {
    const { error } = await supabase
      .from('products')
      .update({ stock: Math.max(0, quantity), updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }, []);

  const getMyOrders = useCallback((phone: string) => {
    return orders.filter(order => order.customerPhone === phone);
  }, [orders]);

  const getPendingOrdersCount = useCallback(() => {
    return orders.filter(order => order.status === 'pending').length;
  }, [orders]);

  const getNewOrdersCount = useCallback(() => {
    return newOrders.length;
  }, [newOrders]);

  const clearNewOrders = useCallback(() => {
    setNewOrders([]);
  }, []);

  return {
    products,
    cart,
    orders,
    lastOrder,
    isLoading,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getCartTotal,
    getCartItemCount,
    placeOrder,
    updateOrderStatus,
    updateOrderNotes,
    assignDriver,
    addProduct,
    updateProduct,
    deleteProduct,
    updateStock,
    getMyOrders,
    getPendingOrdersCount,
    getNewOrdersCount,
    clearNewOrders,
  };
}
