const PRODUCT_STORAGE_KEY = 'fl_pneus_products';
const ORDER_STORAGE_KEY = 'fl_pneus_orders';
const formatPrice = (value) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
}).format(value);

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[character]);

const apiRequest = async (path, options = {}) => {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Falha na comunicação com o servidor.');
  return result;
};

const inventoryList = document.getElementById('inventoryList');
const ordersList = document.getElementById('ordersList');
const form = document.getElementById('adminProductForm');
const submitButton = document.getElementById('adminSubmitButton');
const resetButton = document.getElementById('resetAdminForm');
const yearElement = document.getElementById('year');
const ordersCount = document.getElementById('ordersCount');
const logoutButton = document.getElementById('logoutButton');
const loginStatus = document.getElementById('loginStatus');
const imageInput = document.getElementById('productImage');
const imagePreview = document.getElementById('imagePreview');
const imagePreviewWrap = document.getElementById('imagePreviewWrap');
let editingId = null;
let selectedImage = '';
let productsCache = [];

if (loginStatus) {
  loginStatus.textContent = 'Logado como administrador';
}

if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    await apiRequest('/api/logout', { method: 'POST', body: '{}' });
    window.location.href = 'login.html';
  });
}

const renderInventory = () => {
  const products = productsCache;

  inventoryList.innerHTML = products.map((product) => `
    <div class="inventory-item">
      <div>
        <strong>${escapeHTML(product.name)}</strong>
        <span>${escapeHTML(product.brand)} • ${escapeHTML(product.category)}</span>
      </div>
      <div class="inventory-meta">
        <span>${product.stock} em estoque</span>
        <strong>${formatPrice(product.price)}</strong>
      </div>
      <div class="inventory-actions">
        <button type="button" class="admin-btn edit" data-edit-id="${product.id}">Editar</button>
        <button type="button" class="admin-btn delete" data-delete-id="${product.id}">Excluir</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.admin-btn.edit').forEach((button) => {
    button.addEventListener('click', () => {
      const product = productsCache.find((item) => item.id === Number(button.dataset.editId));
      if (!product) return;

      editingId = product.id;
      form.elements.name.value = product.name;
      form.elements.brand.value = product.brand;
      form.elements.category.value = product.category;
      form.elements.price.value = product.price;
      form.elements.stock.value = product.stock;
      form.elements.badge.value = product.badge || '';
      selectedImage = product.image || '';
      updateImagePreview(selectedImage);
      submitButton.textContent = 'Atualizar pneu';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  document.querySelectorAll('.admin-btn.delete').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await apiRequest(`/api/products/${button.dataset.deleteId}`, { method: 'DELETE' });
        productsCache = productsCache.filter((item) => item.id !== Number(button.dataset.deleteId));
        renderInventory();
      } catch (error) {
        alert(error.message);
      }
    });
  });
};

const updateImagePreview = (image) => {
  if (!imagePreview || !imagePreviewWrap) return;
  imagePreview.src = image || '';
  imagePreviewWrap.hidden = !image;
};

if (imageInput) {
  imageInput.addEventListener('change', () => {
    const file = imageInput.files && imageInput.files[0];
    if (!file) {
      selectedImage = '';
      updateImagePreview('');
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('Selecione um arquivo de imagem.');
      imageInput.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 2 MB.');
      imageInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      selectedImage = String(reader.result || '');
      updateImagePreview(selectedImage);
    });
    reader.readAsDataURL(file);
  });
}

const renderOrders = async () => {
  const orders = await apiRequest('/api/orders');
  ordersCount.textContent = `${orders.length} pedido${orders.length === 1 ? '' : 's'}`;

  if (!orders.length) {
    ordersList.innerHTML = '<div class="empty-state">Nenhum pedido recebido ainda.</div>';
    return;
  }

  ordersList.innerHTML = orders.slice().reverse().map((order) => `
    <div class="order-card">
      <div class="order-header">
        <strong>#${order.id}</strong>
        <span class="order-status">${order.status || 'Novo'}</span>
      </div>
      <div class="order-body">
        <p><strong>Cliente:</strong> ${escapeHTML(order.customerName)}</p>
        <p><strong>WhatsApp:</strong> ${escapeHTML(order.phone)}</p>
        <p><strong>Veículo:</strong> ${escapeHTML(order.vehicle)}</p>
        <p><strong>Atendimento:</strong> ${escapeHTML(order.serviceType || 'Retirada na loja')}</p>
        <p><strong>Pagamento:</strong> ${escapeHTML(order.paymentMethod || 'PIX')} • ${escapeHTML(order.paymentLabel || `em ${order.installments || 1}x`)}</p>
        <p><strong>Itens:</strong> ${order.items.map((item) => `${escapeHTML(item.name)} (${Number(item.qty)}x)`).join(', ')}</p>
        <p><strong>Total:</strong> ${formatPrice(order.total)}</p>
      </div>
      <label class="status-select-wrap">
        <span>Status do pedido</span>
        <select class="status-select" data-order-id="${order.id}">
          <option value="Novo" ${order.status === 'Novo' ? 'selected' : ''}>Novo</option>
          <option value="Em preparação" ${order.status === 'Em preparação' ? 'selected' : ''}>Em preparação</option>
          <option value="Pronto para retirada" ${order.status === 'Pronto para retirada' ? 'selected' : ''}>Pronto para retirada</option>
          <option value="Finalizado" ${order.status === 'Finalizado' ? 'selected' : ''}>Finalizado</option>
        </select>
      </label>
    </div>
  `).join('');

  document.querySelectorAll('.status-select').forEach((select) => {
    select.addEventListener('change', async (event) => {
      try {
        await apiRequest(`/api/orders/${event.target.dataset.orderId}`, {
          method: 'PUT',
          body: JSON.stringify({ status: event.target.value })
        });
      } catch (error) {
        alert(error.message);
        await renderOrders();
      }
    });
  });
};

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const product = {
    name: String(formData.get('name') || '').trim(),
    brand: String(formData.get('brand') || '').trim(),
    category: String(formData.get('category') || 'carro'),
    price: Number(formData.get('price') || 0),
    stock: Number(formData.get('stock') || 0),
    badge: String(formData.get('badge') || 'Novo'),
    image: selectedImage || (editingId !== null ? productsCache.find((item) => item.id === editingId)?.image || '' : ''),
    description: 'Produto cadastrado pela loja.'
  };

  if (!product.name || !product.brand || product.price <= 0 || product.stock < 0) {
    alert('Preencha corretamente os dados do pneu.');
    return;
  }

  if (editingId !== null) {
    product.id = editingId;
  }

  try {
    await apiRequest('/api/products', { method: 'POST', body: JSON.stringify(product) });
    editingId = null;
    submitButton.textContent = 'Salvar pneu';
    form.reset();
    selectedImage = '';
    updateImagePreview('');
    await loadAdminData();
  } catch (error) {
    alert(error.message);
  }
});

resetButton.addEventListener('click', () => {
  editingId = null;
  submitButton.textContent = 'Salvar pneu';
  form.reset();
  selectedImage = '';
  updateImagePreview('');
});

const loadAdminData = async () => {
  productsCache = await apiRequest('/api/products');
  localStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(productsCache));
  renderInventory();
  await renderOrders();
};

const initializeAdmin = async () => {
  if (yearElement) yearElement.textContent = new Date().getFullYear();
  try {
    const session = await apiRequest('/api/session');
    if (!session.authenticated) {
      window.location.href = 'login.html';
      return;
    }

    if (!localStorage.getItem('fl_pneus_server_migrated')) {
      const legacyProducts = JSON.parse(localStorage.getItem(PRODUCT_STORAGE_KEY) || '[]');
      if (legacyProducts.length) {
        await apiRequest('/api/products/migrate', {
          method: 'POST',
          body: JSON.stringify({ products: legacyProducts })
        });
      }
      localStorage.setItem('fl_pneus_server_migrated', 'true');
    }

    await loadAdminData();
  } catch (error) {
    alert(`Não foi possível conectar ao servidor: ${error.message}`);
  }
};

initializeAdmin();
