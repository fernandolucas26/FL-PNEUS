const formatPrice = (value) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
}).format(value);

const orderStatusContent = document.getElementById('orderStatusContent');

const orderId = localStorage.getItem('fl_pneus_last_order_id');
const demoOrders = JSON.parse(localStorage.getItem('fl_pneus_orders') || '[]');
const demoOrder = demoOrders.find((order) => order.id === orderId);

const loadOrderStatus = async () => {
if (!orderId) {
  orderStatusContent.innerHTML = '<div class="empty-state">Nenhum pedido foi encontrado.</div>';
} else {
  let latestOrder = demoOrder;
  if (!window.location.hostname.endsWith('github.io')) {
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
      if (response.ok) latestOrder = await response.json();
    } catch (error) {
      console.info('Exibindo pedido salvo nesta demonstração.');
    }
  }

  if (!latestOrder) {
    orderStatusContent.innerHTML = '<div class="empty-state">Não foi possível localizar seu pedido.</div>';
  } else {
  orderStatusContent.innerHTML = `
    <div class="order-status-box">
      <div class="order-status-row">
        <span>Pedido</span>
        <strong>#${latestOrder.id}</strong>
      </div>
      <div class="order-status-row">
        <span>Status</span>
        <strong>${latestOrder.status || 'Novo'}</strong>
      </div>
      <div class="order-status-row">
        <span>Cliente</span>
        <strong>${latestOrder.customerName}</strong>
      </div>
      <div class="order-status-row">
        <span>Veículo</span>
        <strong>${latestOrder.vehicle}</strong>
      </div>
      <div class="order-status-row">
        <span>Tipo</span>
        <strong>${latestOrder.serviceType || 'Retirada na loja'}</strong>
      </div>
      <div class="order-status-row">
        <span>Pagamento</span>
        <strong>${latestOrder.paymentMethod || 'PIX'} • ${latestOrder.paymentLabel || `em ${latestOrder.installments || 1}x`}</strong>
      </div>
      <div class="order-status-row">
        <span>Itens</span>
        <strong>${latestOrder.items.map((item) => `${item.name} (${item.qty}x)`).join(', ')}</strong>
      </div>
      <div class="order-status-row total-row">
        <span>Total</span>
        <strong>${formatPrice(latestOrder.total || 0)}</strong>
      </div>
    </div>
  `;

  }
}
};

loadOrderStatus();
