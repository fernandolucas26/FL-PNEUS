const defaultProducts = [
  {
    id: 1,
    name: 'RoadMax 205/55R16',
    brand: 'Bridgestone',
    category: 'carro',
    price: 489,
    stock: 18,
    badge: 'Mais vendido',
    description: 'Desempenho urbano com maior aderência e conforto.'
  },
  {
    id: 2,
    name: 'TrailPro 225/65R17',
    brand: 'Pirelli',
    category: 'suv',
    price: 699,
    stock: 7,
    badge: 'Top',
    description: 'Para rodar com estabilidade em estradas e cidade.'
  },
  {
    id: 3,
    name: 'StreetRide 120/70R17',
    brand: 'Michelin',
    category: 'moto',
    price: 319,
    stock: 12,
    badge: 'Popular',
    description: 'Tração firme com excelente resposta em curvas.'
  },
  {
    id: 4,
    name: 'HeavyDrive 245/75R16',
    brand: 'Continental',
    category: 'caminhao',
    price: 899,
    stock: 5,
    badge: 'Carga',
    description: 'Resistência e estabilidade para uso diário e pesado.'
  }
];

const productGrid = document.getElementById('productGrid');
const searchInput = document.getElementById('searchInput');
const filterButtons = document.querySelectorAll('.filter-btn');
const menuToggle = document.querySelector('.menu-toggle');
const navMenu = document.querySelector('.nav');
const yearElement = document.querySelector('#year');
const totalStockElement = document.getElementById('totalStock');
const lowStockCountElement = document.getElementById('lowStockCount');
const productForm = document.getElementById('productForm');
const submitButton = document.getElementById('submitButton');
const adminList = document.getElementById('adminList');
const adminCount = document.getElementById('adminCount');
const cartCountElement = document.getElementById('cartCount');
const cartButton = document.querySelector('.cart-button');
const cartPanel = document.getElementById('cartPanel');
const cartItemsElement = document.getElementById('cartItems');
const cartTotalElement = document.getElementById('cartTotal');
const cartCloseButton = document.getElementById('cartClose');
const clearCartButton = document.getElementById('clearCartBtn');
const whatsappOrderLink = document.getElementById('whatsappOrder');

const STORAGE_KEY = 'fl_pneus_products';
const CART_KEY = 'fl_pneus_cart';
let currentFilter = 'all';
let editingId = null;

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

function getProducts() {
  const savedProducts = localStorage.getItem(STORAGE_KEY);
  if (!savedProducts) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultProducts));
    return [...defaultProducts];
  }

  try {
    const parsed = JSON.parse(savedProducts);
    return Array.isArray(parsed) && parsed.length ? parsed : [...defaultProducts];
  } catch (error) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultProducts));
    return [...defaultProducts];
  }
}

function saveProducts(products) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}

function getCart() {
  const savedCart = localStorage.getItem(CART_KEY);
  if (!savedCart) return [];

  try {
    const parsed = JSON.parse(savedCart);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function getStockStatus(stock) {
  if (stock <= 5) {
    return { text: 'Poucas peças', className: 'low-stock' };
  }
  if (stock <= 10) {
    return { text: 'Últimas unidades', className: 'low-stock' };
  }
  return { text: 'Disponível agora', className: 'in-stock' };
}

function updateStockSummary(products) {
  const total = products.reduce((sum, item) => sum + Number(item.stock || 0), 0);
  const lowStock = products.filter((item) => Number(item.stock || 0) <= 10).length;

  if (totalStockElement) totalStockElement.textContent = `${total} unidades`;
  if (lowStockCountElement) lowStockCountElement.textContent = `${lowStock} itens`;
}

function renderDailyOffer(products) {
  const offerPrice = document.getElementById('dailyOfferPrice');
  const offerProduct = document.getElementById('dailyOfferProduct');
  const offerImage = document.getElementById('dailyOfferImage');
  const offerFallback = document.getElementById('dailyOfferFallback');
  if (!offerPrice || !offerProduct || !offerImage || !offerFallback) return;

  const availableProducts = products.filter((product) => Number(product.stock || 0) > 0);
  const featuredProduct = availableProducts.find((product) =>
    String(product.badge || '').trim().toLowerCase() === 'oferta do dia'
  ) || availableProducts[0];

  if (!featuredProduct) {
    offerPrice.textContent = 'Sem ofertas';
    offerProduct.textContent = 'Estoque indisponível';
    offerImage.hidden = true;
    offerFallback.hidden = false;
    return;
  }

  offerPrice.textContent = formatPrice(Number(featuredProduct.price || 0));
  offerProduct.textContent = `${featuredProduct.brand || 'Pneu'} ${featuredProduct.name}`;

  if (!featuredProduct.image) {
    offerImage.removeAttribute('src');
    offerImage.alt = '';
    offerImage.hidden = true;
    offerFallback.hidden = false;
    return;
  }

  offerImage.hidden = true;
  offerFallback.hidden = false;
  offerImage.alt = `Foto do pneu ${featuredProduct.name}`;
  offerImage.onload = () => {
    offerImage.hidden = false;
    offerFallback.hidden = true;
  };
  offerImage.onerror = () => {
    offerImage.hidden = true;
    offerFallback.hidden = false;
  };
  offerImage.src = featuredProduct.image;
}

function renderProducts() {
  const products = getProducts();
  updateStockSummary(products);
  renderDailyOffer(products);
  renderAdminProducts(products);

  if (!productGrid) return;

  const searchTerm = (searchInput ? searchInput.value : '').trim().toLowerCase();

  const filteredProducts = products.filter((item) => {
    const matchesCategory = currentFilter === 'all' || item.category === currentFilter;
    const matchesSearch = !searchTerm || item.name.toLowerCase().includes(searchTerm) || (item.brand || '').toLowerCase().includes(searchTerm);
    return matchesCategory && matchesSearch;
  });

  productGrid.innerHTML = filteredProducts.map((product) => {
    const status = getStockStatus(Number(product.stock || 0));
    const stockValue = Number(product.stock || 0);
    const isDisabled = stockValue <= 0;

    return `
      <article class="product-card" data-category="${escapeHTML(product.category)}">
        <div class="product-visual">
          <div class="product-badge">${escapeHTML(product.badge || 'Em destaque')}</div>
          ${product.image
            ? `<img class="product-image" src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}" loading="lazy" />`
            : '<div class="tire"></div>'}
        </div>
        <div class="product-body">
          <h3>${escapeHTML(product.name)}</h3>
          <span class="product-brand">${escapeHTML(product.brand || 'Marca')}</span>
          <p>${escapeHTML(product.description || 'Pneu com excelente desempenho e durabilidade.')}</p>
          <div class="product-meta">
            <span class="stars">★★★★★</span>
            <span class="price">${formatPrice(Number(product.price || 0))}</span>
          </div>
          <div class="stock-row">
            <span class="stock-label">Estoque</span>
            <strong class="stock-count">${stockValue} unidades</strong>
          </div>
          <div class="stock-status ${status.className}">${status.text}</div>
          <button class="order-btn" type="button" data-product-id="${product.id}" ${isDisabled ? 'disabled' : ''}>
            ${isDisabled ? 'Esgotado' : 'Adicionar'}
          </button>
        </div>
      </article>
    `;
  }).join('');

  bindProductButtons();
  renderCart();
}

function renderAdminProducts(products) {
  if (!adminList) return;

  if (adminCount) {
    adminCount.textContent = `${products.length} item${products.length === 1 ? '' : 's'}`;
  }

  adminList.innerHTML = products.map((product) => `
    <div class="admin-item">
      <strong>${escapeHTML(product.name)}</strong>
      <span>${escapeHTML(product.brand || 'Marca')}</span>
      <span>${escapeHTML(product.category)}</span>
      <span>${Number(product.stock || 0)} em estoque</span>
      <span>${formatPrice(Number(product.price || 0))}</span>
      <div class="admin-actions-buttons">
        <button type="button" class="admin-btn edit" data-edit-id="${product.id}">Editar</button>
        <button type="button" class="admin-btn delete" data-delete-id="${product.id}">Excluir</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.admin-btn.edit').forEach((button) => {
    button.addEventListener('click', () => {
      const id = Number(button.dataset.editId);
      const product = getProducts().find((item) => item.id === id);
      if (!product) return;

      editingId = id;
      const formFields = productForm.elements;
      formFields.name.value = product.name;
      formFields.brand.value = product.brand || '';
      formFields.category.value = product.category;
      formFields.price.value = product.price;
      formFields.stock.value = product.stock;
      formFields.badge.value = product.badge || '';
      if (submitButton) {
        submitButton.textContent = 'Atualizar pneu';
      }
      window.scrollTo({ top: document.getElementById('admin').offsetTop - 50, behavior: 'smooth' });
    });
  });

  document.querySelectorAll('.admin-btn.delete').forEach((button) => {
    button.addEventListener('click', () => {
      const id = Number(button.dataset.deleteId);
      const productsList = getProducts().filter((item) => item.id !== id);
      saveProducts(productsList);
      if (editingId === id) {
        editingId = null;
        productForm.reset();
        if (submitButton) {
          submitButton.textContent = 'Salvar pneu';
        }
      }
      renderProducts();
    });
  });
}

function bindProductButtons() {
  const orderButtons = document.querySelectorAll('.order-btn');
  orderButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const productId = Number(button.dataset.productId);
      addToCart(productId);
    });
  });
}

function addToCart(productId) {
  const products = getProducts();
  const selectedProduct = products.find((item) => item.id === productId);

  if (!selectedProduct || Number(selectedProduct.stock || 0) <= 0) {
    return;
  }

  const cart = getCart();
  const existingItem = cart.find((item) => item.id === productId);

  if (existingItem) {
    existingItem.qty += 1;
  } else {
    cart.push({ id: productId, qty: 1 });
  }

  saveCart(cart);
  renderCart();
  cartPanel.classList.add('open');
}

function renderCart() {
  const products = getProducts();
  const cart = getCart();
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
  const totalValue = cart.reduce((sum, item) => {
    const product = products.find((productItem) => productItem.id === item.id);
    if (!product) return sum;
    return sum + Number(product.price || 0) * item.qty;
  }, 0);

  if (cartCountElement) {
    cartCountElement.textContent = String(totalItems);
  }

  if (!cartItemsElement || !cartTotalElement) return;

  if (!cart.length) {
    cartItemsElement.innerHTML = '<div class="empty-cart">Seu carrinho está vazio.</div>';
    cartTotalElement.textContent = 'R$ 0,00';
    if (whatsappOrderLink) whatsappOrderLink.href = '#';
    return;
  }

  cartItemsElement.innerHTML = cart.map((item) => {
    const product = products.find((productItem) => productItem.id === item.id);
    if (!product) return '';

    return `
      <div class="cart-item">
        <div>
          <strong>${escapeHTML(product.name)}</strong>
          <small>${item.qty} unidade(s)</small>
        </div>
        <span>${formatPrice(Number(product.price || 0) * item.qty)}</span>
      </div>
    `;
  }).join('');

  cartTotalElement.textContent = formatPrice(totalValue);

  if (whatsappOrderLink) {
    whatsappOrderLink.href = 'checkout.html';
    whatsappOrderLink.textContent = 'Finalizar compra';
  }
}

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    currentFilter = button.dataset.filter;

    filterButtons.forEach((btn) => btn.classList.toggle('active', btn === button));
    renderProducts();
  });
});

if (searchInput) {
  searchInput.addEventListener('input', () => {
    renderProducts();
  });
}

if (productForm) {
  productForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const formData = new FormData(productForm);
    const formProduct = {
      name: String(formData.get('name') || '').trim(),
      brand: String(formData.get('brand') || '').trim(),
      category: String(formData.get('category') || 'carro'),
      price: Number(formData.get('price') || 0),
      stock: Number(formData.get('stock') || 0),
      badge: String(formData.get('badge') || 'Novo'),
      description: 'Produto cadastrado pelo responsável da loja.'
    };

    if (!formProduct.name || !formProduct.brand || formProduct.price <= 0 || formProduct.stock < 0) {
      alert('Preencha corretamente os dados do pneu.');
      return;
    }

    const products = getProducts();

    if (editingId !== null) {
      const productIndex = products.findIndex((item) => item.id === editingId);
      if (productIndex >= 0) {
        products[productIndex] = {
          ...products[productIndex],
          ...formProduct
        };
      }
      editingId = null;
      if (submitButton) {
        submitButton.textContent = 'Salvar pneu';
      }
    } else {
      products.unshift({
        id: Date.now(),
        ...formProduct
      });
    }

    saveProducts(products);
    renderProducts();
    productForm.reset();
  });
}

if (cartButton && cartPanel) {
  cartButton.addEventListener('click', () => {
    cartPanel.classList.toggle('open');
  });
}

if (cartCloseButton && cartPanel) {
  cartCloseButton.addEventListener('click', () => {
    cartPanel.classList.remove('open');
  });
}

if (clearCartButton) {
  clearCartButton.addEventListener('click', () => {
    saveCart([]);
    renderCart();
  });
}

if (yearElement) {
  yearElement.textContent = new Date().getFullYear();
}

if (menuToggle && navMenu) {
  menuToggle.addEventListener('click', () => {
    navMenu.classList.toggle('is-open');
  });

  navMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => navMenu.classList.remove('is-open'));
  });
}

async function initializeStore() {
  if (window.location.hostname.endsWith('github.io')) {
    renderProducts();
    return;
  }

  try {
    const response = await fetch('/api/products');
    if (!response.ok) throw new Error('Não foi possível carregar os produtos do servidor.');
    const products = await response.json();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  } catch (error) {
    console.error(error);
  }

  renderProducts();
}

initializeStore();
