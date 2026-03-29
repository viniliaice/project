import { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { AdminPanel } from './components/AdminPanel';
import { useStore } from './store/useStore';
import { AuthProvider, useAuth } from './context/AuthContext';
import { supabase } from './lib/supabase';
import { OrderToast } from './components/OrderToast';

function AdminMain() {
  const store = useStore();
  const { isAdmin } = useAuth();
  const [toast, setToast] = useState<{ title: string; message: string; visible: boolean }>({ title: '', message: '', visible: false });

  useEffect(() => {
    // Request notification permission for admin users on mount
    try {
      if (isAdmin && typeof window !== 'undefined' && typeof Notification !== 'undefined') {
        if (Notification.permission === 'default') Notification.requestPermission().catch(() => {});
      }
    } catch (_) {}
  }, [isAdmin]);

  const lastSeenRef = useRef<string | null>(store.orders?.[0]?.id || null);

  useEffect(() => {
    const handler = async (e: any) => {
      const d = e?.detail || {};
      console.debug('[admin] received grocery:new-order event', d);
      // Refresh orders from the DB so UI list/stats update
      try {
        if (typeof store.refreshOrders === 'function') await store.refreshOrders();
      } catch (err) {
        console.warn('refreshOrders failed in event handler', err);
      }
      lastSeenRef.current = d.id || lastSeenRef.current;
      setToast({ title: 'New Order', message: `${d.customerName || ''} — $${((d.total || 0)).toFixed(2)}`, visible: true });
      setTimeout(() => setToast(s => ({ ...s, visible: false })), 4000);

      // show browser notification if permitted
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('New Order', { body: `${d.customerName || ''} — $${((d.total || 0)).toFixed(2)}`, tag: d.id });
        }
      } catch (err) {
        console.warn('Notification error', err);
      }
    };

    window.addEventListener('grocery:new-order', handler as EventListener);
    return () => window.removeEventListener('grocery:new-order', handler as EventListener);
  }, [store.refreshOrders]);

  const simulateOrder = () => {
    const id = `sim-${Date.now()}`;
    const payload = { id, customerName: 'Test Customer', total: 9.99 };
    window.dispatchEvent(new CustomEvent('grocery:new-order', { detail: payload }));
    setToast({ title: 'Simulated Order', message: `${payload.customerName} — $${payload.total.toFixed(2)}`, visible: true });
    setTimeout(() => setToast(s => ({ ...s, visible: false })), 3000);
  };

  // Poll fallback: check for new orders every 5s if realtime misses them
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('id, customer_name, total, created_at')
          .order('created_at', { ascending: false })
          .limit(1);
        if (error) return console.warn('poll error', error);
        const latest = data?.[0];
        if (!latest) return;
        if (lastSeenRef.current !== latest.id) {
          lastSeenRef.current = latest.id;
          try {
            if (typeof store.refreshOrders === 'function') await store.refreshOrders();
          } catch (err) {
            console.warn('refreshOrders failed during poll', err);
          }
          window.dispatchEvent(new CustomEvent('grocery:new-order', { detail: { id: latest.id, customerName: latest.customer_name, total: latest.total } }));
        }
      } catch (err) {
        console.error('polling error', err);
      }
    };

    const interval = setInterval(() => { if (mounted) poll(); }, 5000);
    // initial poll
    poll();
    return () => { mounted = false; clearInterval(interval); };
  }, [store.refreshOrders]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {(import.meta as any).env.DEV && (
        <div className="mb-4">
          <button onClick={simulateOrder} className="bg-indigo-600 text-white px-3 py-2 rounded-md hover:bg-indigo-700">Simulate New Order</button>
        </div>
      )}
      <AdminPanel
        orders={store.orders}
        products={store.products}
        lowStockProducts={store.products.filter(p => p.stock > 0 && p.stock <= p.lowStock)}
        outOfStockProducts={store.products.filter(p => p.stock === 0)}
        onUpdateStatus={store.updateOrderStatus}
        onUpdateNotes={store.updateOrderNotes}
        onAssignDriver={(id, name) => store.assignDriver(id, name, '555-0100')}
        onAddProduct={store.addProduct}
        onUpdateProduct={store.updateProduct}
        onDeleteProduct={store.deleteProduct}
        onUpdateStock={store.updateStock}
        clearNewOrders={store.clearNewOrders}
      />
      <OrderToast visible={toast.visible} title={toast.title} message={toast.message} onClose={() => setToast(s => ({ ...s, visible: false }))} />
    </div>
  );
}

function AdminApp() {
  return (
    <AuthProvider>
      <AdminMain />
    </AuthProvider>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<AdminApp />);
