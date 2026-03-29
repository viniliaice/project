import { useEffect, useState } from 'react';
import { useStore } from './store/useStore';
import { Page } from './types';
import { Header } from './components/Header';
import { ShopPage } from './components/ShopPage';
import { CartPage } from './components/CartPage';
import { CheckoutPage } from './components/CheckoutPage';
import { OrderSuccessPage } from './components/OrderSuccessPage';
import { MyOrdersPage } from './components/MyOrdersPage';
import { AdminPanel } from './components/AdminPanel';
import { AuthProvider } from './context/AuthContext';
import { OrderToast } from './components/OrderToast';
 
function App() {

  const [currentPage, setCurrentPage] = useState<Page>('shop');
  const [customerPhone, setCustomerPhone] = useState('');
  const store = useStore();
  const [toast, setToast] = useState<{ title: string; message: string; visible: boolean }>({ title: '', message: '', visible: false });

  useEffect(() => {
    const handler = (e: any) => {
      const d = e?.detail || {};
      setToast({ title: 'New Order', message: `${d.customerName || ''} — $${((d.total || 0)).toFixed(2)}`, visible: true });
      // auto hide after 4s
      setTimeout(() => setToast(s => ({ ...s, visible: false })), 4000);
    };
    window.addEventListener('grocery:new-order', handler as EventListener);
    return () => window.removeEventListener('grocery:new-order', handler as EventListener);
  }, []);

  const navigateTo = (page: Page) => {
    setCurrentPage(page);
    window.scrollTo(0, 0);
    if (page === 'admin' && store.clearNewOrders) {
      try { store.clearNewOrders(); } catch (_) {}
    }
  };

  // Derive values from store
  const cartCount = store.getCartItemCount();
  const newOrderCount = store.getNewOrdersCount ? store.getNewOrdersCount() : store.getPendingOrdersCount();

  const handlePlaceOrder = async (customerData: {
    name: string;
    phone: string;
    location: string;
    notes: string;
    paymentMethod: 'cash' | 'TELESOM';
  }) => {
    setCustomerPhone(customerData.phone);
    await store.placeOrder(customerData);
    navigateTo('order-success');
  };

  const handleAssignDriver = (orderId: string, driverName: string) => {
    // For simplicity, we use a placeholder phone for drivers
    store.assignDriver(orderId, driverName, '555-0100');
  };

  // Get low stock and out of stock products
  const lowStockProducts = store.products.filter(p => p.stock > 0 && p.stock <= p.lowStock);
  const outOfStockProducts = store.products.filter(p => p.stock === 0);

  const renderPage = () => {
    switch (currentPage) {
      case 'shop':
        return (
          <ShopPage
            products={store.products}
            cart={store.cart}
            onAddToCart={store.addToCart}
            onUpdateQuantity={store.updateQuantity}
            isLoading={store.isLoading}
            onNavigate={navigateTo}
          />
        );
      case 'cart':
        return (
          <CartPage
            cart={store.cart}
            onUpdateQuantity={store.updateQuantity}
            onRemoveItem={store.removeFromCart}
            cartTotal={store.getCartTotal()}
            onCheckout={() => navigateTo('checkout')}
            onBack={() => navigateTo('shop')}
          />
        );
      case 'checkout':
        return (
          <CheckoutPage
            cart={store.cart}
            cartTotal={store.getCartTotal()}
            onPlaceOrder={handlePlaceOrder}
            onBack={() => navigateTo('cart')}
          />
        );
      case 'order-success':
        return (
          <OrderSuccessPage
            order={store.lastOrder}
            onContinueShopping={() => navigateTo('shop')}
            onViewOrders={() => navigateTo('my-orders')}
          />
        );
      case 'my-orders':
        return (
          <MyOrdersPage
            orders={store.orders.filter(o => o.customerPhone === customerPhone)}
            onBack={() => navigateTo('shop')}
          />
        );
      case 'admin':
        return (
          <AdminPanel
            orders={store.orders}
            products={store.products}
            lowStockProducts={lowStockProducts}
            outOfStockProducts={outOfStockProducts}
            onUpdateStatus={store.updateOrderStatus}
            onUpdateNotes={store.updateOrderNotes}
            onAssignDriver={handleAssignDriver}
            onAddProduct={store.addProduct}
            onUpdateProduct={store.updateProduct}
            onDeleteProduct={store.deleteProduct}
            onUpdateStock={store.updateStock}
          />
        );
      default:
        return <ShopPage products={store.products} cart={store.cart} onAddToCart={store.addToCart} onUpdateQuantity={store.updateQuantity} isLoading={store.isLoading} />;
    }
  };

  return (
    <AuthProvider>
      <div className="min-h-screen bg-gray-50">
        <Header
          cartCount={cartCount}
          currentPage={currentPage}
          onNavigate={navigateTo}
          newOrderCount={newOrderCount}
        />
        <main className="pb-20 md:pb-8">
          {renderPage()}
          <OrderToast visible={toast.visible} title={toast.title} message={toast.message} onClose={() => setToast(s => ({ ...s, visible: false }))} />
        </main>
      </div>
    </AuthProvider>
  );
}

export default App;
