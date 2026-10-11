const PRODUCT_STORAGE_KEY = 'fl_pneus_products';
const CART_STORAGE_KEY = 'fl_pneus_cart';
const ORDER_STORAGE_KEY = 'fl_pneus_orders';

const formatPrice = (value) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
}).format(value);

const getProducts = () => {
  const saved = localStorage.getItem(PRODUCT_STORAGE_KEY);
  if (!saved) return [];

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const getCart = () => {
  const saved = localStorage.getItem(CART_STORAGE_KEY);
  if (!saved) return [];

  try {
    return JSON.parse(saved);
  } catch (error) {
    return [];
  }
};

const saveCart = (cart) => localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
const checkoutItems = document.getElementById('checkoutItems');
const checkoutTotal = document.getElementById('checkoutTotal');
const checkoutForm = document.getElementById('checkoutForm');
const yearElement = document.getElementById('year');

const cart = getCart();
let products = getProducts();

const apiRequest = async (path, options = {}) => {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Falha na comunicação com o servidor.');
  return result;
};

const renderCheckout = () => {
if (!cart.length) {
  checkoutItems.innerHTML = '<div class="empty-state">Seu carrinho está vazio. Volte para a loja e selecione os pneus.</div>';
  checkoutTotal.textContent = 'R$ 0,00';
} else {
  const itemsList = cart.map((item) => {
    const product = products.find((productItem) => productItem.id === item.id);
    if (!product) return null;

    return `
      <div class="checkout-item">
        <div>
          <strong>${product.name}</strong>
          <small>${item.qty} unidade(s)</small>
        </div>
        <span>${formatPrice(Number(product.price) * item.qty)}</span>
      </div>
    `;
  }).filter(Boolean).join('');

  const subtotal = cart.reduce((sum, item) => {
    const product = products.find((productItem) => productItem.id === item.id);
    return sum + (product ? Number(product.price) * item.qty : 0);
  }, 0);

  checkoutItems.innerHTML = itemsList;
  checkoutTotal.textContent = formatPrice(subtotal);
}
};

const initializeCheckout = async () => {
  if (window.location.hostname.endsWith('github.io')) {
    renderCheckout();
    return;
  }

  try {
    products = await apiRequest('/api/products');
    localStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(products));
  } catch (error) {
    console.error(error);
  }
  renderCheckout();
};

initializeCheckout();

const saveDemoOrder = (orderData) => {
  const subtotal = cart.reduce((sum, item) => {
    const product = products.find((productItem) => productItem.id === item.id);
    return sum + (product ? Number(product.price) * item.qty : 0);
  }, 0);
  const localOrder = {
    ...orderData,
    id: `DEMO-${Date.now()}`,
    status: 'Pedido de demonstração',
    total: subtotal,
    items: cart.map((item) => {
      const product = products.find((productItem) => productItem.id === item.id);
      return { id: item.id, name: product ? product.name : 'Pneu', qty: item.qty, price: product ? Number(product.price) : 0 };
    }),
    createdAt: new Date().toISOString()
  };
  const savedOrders = JSON.parse(localStorage.getItem(ORDER_STORAGE_KEY) || '[]');
  savedOrders.push(localOrder);
  localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(savedOrders));
  localStorage.setItem('fl_pneus_last_order_id', localOrder.id);
  saveCart([]);
  checkoutForm.reset();
  window.location.href = 'status.html';
};

checkoutForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!cart.length) {
    alert('Seu carrinho está vazio.');
    return;
  }

  const formData = new FormData(checkoutForm);
  const customerName = String(formData.get('name') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const vehicle = String(formData.get('vehicle') || '').trim();
  const serviceType = String(formData.get('serviceType') || 'Retirada na loja');
  const notes = String(formData.get('notes') || '').trim();

  if (!customerName || !phone || !vehicle) {
    alert('Preencha nome, WhatsApp e veículo para concluir o pedido.');
    return;
  }

  const orderData = {
    customerName,
    phone,
    vehicle,
    serviceType,
    paymentMethod: 'Na loja',
    installments: 1,
    paymentLabel: 'A combinar na loja',
    notes,
    items: cart.map((item) => ({ id: item.id, qty: item.qty }))
  };

  if (window.location.hostname.endsWith('github.io')) {
    saveDemoOrder(orderData);
    return;
  }

  try {
    const order = await apiRequest('/api/orders', {
      method: 'POST',
      body: JSON.stringify(orderData)
    });

    localStorage.setItem('fl_pneus_last_order_id', order.id);
    saveCart([]);
    checkoutForm.reset();
    window.location.href = 'status.html';
  } catch (error) {
    saveDemoOrder(orderData);
  }
});

if (yearElement) {
  yearElement.textContent = new Date().getFullYear();
}
