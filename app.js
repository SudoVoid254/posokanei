// ============ API SERVICE ============
const API = {
  WORKER_URL: 'https://posokanei-worker.jxrono10.workers.dev/api',
  
  async getCategories() {
    const cached = sessionStorage.getItem('categories');
    if (cached) return JSON.parse(cached);
    
    try {
      const res = await fetch(
        `${this.WORKER_URL}/meta/categories/tree?include_counts=true&include_hidden=false`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      sessionStorage.setItem('categories', JSON.stringify(data.tree));
      return data.tree;
    } catch (err) {
      throw new Error('Failed to load categories: ' + err.message);
    }
  },
  
  async getProducts(catId, page, pageSize, sortOrder) {
    try {
      const res = await fetch(
        `${this.WORKER_URL}/products?page=${page}&page_size=${pageSize}&category=${catId}&countries=GR&sort_by=unit_price&sort_order=${sortOrder}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      throw new Error('Failed to load products: ' + err.message);
    }
  }
};

// ============ STATE ============
const state = {
  selectedCategoryId: null,
  selectedCategoryName: '',
  currentPage: 1,
  pageSize: 50,
  sortOrder: 'asc',
  allProducts: [],
  filteredProducts: [],
  darkMode: localStorage.getItem('darkMode') === 'true',
  priceMin: 0,
  priceMax: 999999,
  favorites: JSON.parse(localStorage.getItem('favorites') || '[]'),
  compareProducts: JSON.parse(localStorage.getItem('compareProducts') || '[]'),
  selectedBrand: 'all'
};

// ============ DEBOUNCE ============
function debounce(fn, delay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// ============ INITIALIZATION ============
async function init() {
  try {
    const categories = await API.getCategories();
    renderCategories(categories);
    setupEventListeners();
    
    // Set initial theme toggle text
    const themeToggle = document.getElementById('themeToggle');
    themeToggle.textContent = state.darkMode ? '☀ Light' : '🌙 Dark';
  } catch (err) {
    showError('Failed to load categories: ' + err.message);
  }
}

// ============ FILTER UTILITIES ============
function clearFilters() {
  const searchInput = document.getElementById('searchInput');
  searchInput.value = '';
  searchInput.blur();
  
  document.getElementById('priceMin').value = '';
  document.getElementById('priceMax').value = '999999';
  document.getElementById('brandFilter').value = 'all';
  document.getElementById('pageSize').value = '50';
  document.getElementById('sortOrder').value = 'asc';
  
  state.priceMin = 0;
  state.priceMax = 999999;
  state.selectedBrand = 'all';
  state.pageSize = 50;
  state.sortOrder = 'asc';
  state.currentPage = 1;
  
  document.getElementById('priceDisplay').textContent = '0';
  document.getElementById('priceDisplayMax').textContent = '999999';
  
  filterAndRenderProducts();
}

function setupEventListeners() {
  const searchInput = document.getElementById('searchInput');
  const pageSize = document.getElementById('pageSize');
  const sortOrder = document.getElementById('sortOrder');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebar = document.querySelector('.sidebar');
  const themeToggle = document.getElementById('themeToggle');
  const priceMinInput = document.getElementById('priceMin');
  const priceMaxInput = document.getElementById('priceMax');
  const brandFilter = document.getElementById('brandFilter');
  const compareBtn = document.getElementById('compareBtn');
  const compareModal = document.getElementById('compareModal');

  // Theme toggle
  if (state.darkMode) document.body.classList.add('dark-mode');
  
  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    state.darkMode = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', state.darkMode);
    themeToggle.textContent = state.darkMode ? '☀ Light' : '🌙 Dark';
  });

  searchInput.addEventListener('input', debounce(() => {
    state.currentPage = 1;
    filterAndRenderProducts();
  }, 300));

  pageSize.addEventListener('change', (e) => {
    state.pageSize = parseInt(e.target.value);
    state.currentPage = 1;
    filterAndRenderProducts();
  });

  sortOrder.addEventListener('change', (e) => {
    state.sortOrder = e.target.value;
    state.currentPage = 1;
    selectCategory(state.selectedCategoryId, state.selectedCategoryName);
  });

  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  // Price range
  if (priceMinInput && priceMaxInput) {
    priceMinInput.addEventListener('input', debounce(() => {
      let value = parseFloat(priceMinInput.value) || 0;
      value = Math.max(0, Math.min(value, 999999));
      state.priceMin = value;
      priceMinInput.value = value;
      document.getElementById('priceDisplay').textContent = value.toFixed(2);
      state.currentPage = 1;
      filterAndRenderProducts();
    }, 300));

    priceMaxInput.addEventListener('input', debounce(() => {
      let value = parseFloat(priceMaxInput.value) || 999999;
      value = Math.max(0, Math.min(value, 999999));
      state.priceMax = value;
      priceMaxInput.value = value;
      document.getElementById('priceDisplayMax').textContent = value.toFixed(2);
      state.currentPage = 1;
      filterAndRenderProducts();
    }, 300));
  }

  // Brand filter
  if (brandFilter) {
    brandFilter.addEventListener('change', (e) => {
      state.selectedBrand = e.target.value;
      state.currentPage = 1;
      filterAndRenderProducts();
    });
  }

  // Clear filters
  const clearBtn = document.getElementById('clearFilters');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearFilters);
  }

  // Compare modal
  if (compareBtn) {
    compareBtn.addEventListener('click', openCompareModal);
  }

  if (compareModal) {
    compareModal.addEventListener('click', (e) => {
      if (e.target === compareModal) closeCompareModal();
    });
    document.getElementById('compareClose').addEventListener('click', closeCompareModal);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && compareModal.classList.contains('open')) {
        closeCompareModal();
      }
    });
  }

  updateCompareButton();
}

// ============ CATEGORIES ============
function renderCategories(categories, depth = 0, parentEl = null) {
  if (!categories || categories.length === 0) {
    const container = parentEl || document.getElementById('categories');
    const li = document.createElement('li');
    li.textContent = 'No categories available';
    li.style.padding = '8px';
    li.style.color = '#999';
    container.appendChild(li);
    return;
  }
  
  const container = parentEl || document.getElementById('categories');
  
  categories.forEach(cat => {
    if (!cat) return;
    
    const li = document.createElement('li');
    li.className = 'category-item';
    
    const btn = document.createElement('button');
    btn.className = `category-btn nested-${Math.min(depth, 3)}`;
    btn.textContent = `${cat.name || 'Unnamed'} (${cat.total_product_count || 0})`;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      selectCategory(cat.category_id, cat.name);
    });
    
    li.appendChild(btn);
    container.appendChild(li);
    
    if (cat.children && cat.children.length > 0) {
      const ul = document.createElement('ul');
      ul.className = 'category-list';
      li.appendChild(ul);
      renderCategories(cat.children, depth + 1, ul);
    }
  });
}

// ============ CATEGORY SELECTION ============
async function selectCategory(catId, catName) {
  state.selectedCategoryId = catId;
  state.selectedCategoryName = catName;
  state.currentPage = 1;
  
  document.getElementById('selectedCatName').textContent = catName;
  document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
  
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('searchInput').value = '';
  state.selectedBrand = 'all';
  document.getElementById('brandFilter').value = 'all';
  
  showLoading();
  window.scrollTo({top: 0, behavior: 'smooth'});
  
  try {
    const data = await API.getProducts(catId, 1, 1000, 'asc');
    state.allProducts = data.products || [];
    updateBrandOptions();
    filterAndRenderProducts();
  } catch (err) {
    showError('Failed to load products: ' + err.message);
  }
}

// ============ COMPARE ============
function getProductId(product) {
  return product.id || product.name || `product-${Math.random()}`;
}

function toggleCompare(productId, e) {
  e.stopPropagation();
  const idx = state.compareProducts.indexOf(productId);
  if (idx > -1) {
    state.compareProducts.splice(idx, 1);
  } else {
    if (state.compareProducts.length < 4) {
      state.compareProducts.push(productId);
    } else {
      alert('Maximum 4 products to compare');
      return;
    }
  }
  localStorage.setItem('compareProducts', JSON.stringify(state.compareProducts));
  updateCompareButton();
  filterAndRenderProducts();
}

function isInCompare(productId) {
  return state.compareProducts.includes(productId);
}

function updateCompareButton() {
  const btn = document.getElementById('compareBtn');
  const count = document.getElementById('compareCount');
  if (state.compareProducts.length === 0) {
    btn.classList.add('disabled');
    count.textContent = '0';
  } else {
    btn.classList.remove('disabled');
    count.textContent = state.compareProducts.length;
  }
}

function openCompareModal() {
  if (state.compareProducts.length === 0) return;
  
  const products = state.compareProducts.map(id => 
    state.allProducts.find(p => getProductId(p) === id)
  ).filter(p => p);

  if (products.length === 0) {
    alert('Selected products not found');
    return;
  }

  const modal = document.getElementById('compareModal');
  const table = document.getElementById('compareTable');

  let html = `
    <tr>
      <th>Property</th>
      ${products.map(p => `<th>${p.name}</th>`).join('')}
    </tr>
    <tr>
      <td>Brand</td>
      ${products.map(p => `<td>${p.brand || 'N/A'}</td>`).join('')}
    </tr>
    <tr>
      <td>Min Price</td>
      ${products.map(p => `<td class="compare-price">€${p.price_stats?.min_price?.toFixed(2) || 'N/A'}</td>`).join('')}
    </tr>
    <tr>
      <td>Avg Price</td>
      ${products.map(p => `<td>€${p.price_stats?.avg_price?.toFixed(2) || 'N/A'}</td>`).join('')}
    </tr>
    <tr>
      <td>Max Price</td>
      ${products.map(p => `<td>€${p.price_stats?.max_price?.toFixed(2) || 'N/A'}</td>`).join('')}
    </tr>
    <tr>
      <td>Retailers</td>
      ${products.map(p => `<td>${p.retailer_prices?.length || 0}</td>`).join('')}
    </tr>
    <tr>
      <td>Action</td>
      ${products.map(p => `
        <td>
          <button class="compare-remove" onclick="toggleCompare('${getProductId(p)}', event)">Remove</button>
        </td>
      `).join('')}
    </tr>
  `;

  table.innerHTML = html;
  modal.classList.add('open');
}

function closeCompareModal() {
  document.getElementById('compareModal').classList.remove('open');
}

// ============ BRAND FILTER ============
function updateBrandOptions() {
  const brands = [...new Set(state.allProducts
    .filter(p => p.brand)
    .map(p => p.brand)
  )].sort();

  const select = document.getElementById('brandFilter');
  if (select) {
    const current = select.value;
    select.innerHTML = '<option value="all">All Brands</option>' +
      brands.map(b => `<option value="${b}">${b}</option>`).join('');
    select.value = current;
  }
}

// ============ FILTERING & PAGINATION ============
function filterAndRenderProducts() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  
  state.filteredProducts = state.allProducts.filter(p => {
    const nameMatch = p.name.toLowerCase().includes(searchTerm) ||
      (p.brand && p.brand.toLowerCase().includes(searchTerm));
    
    const minPrice = p.price_stats?.min_price || 0;
    const priceMatch = minPrice >= state.priceMin && minPrice <= state.priceMax;
    
    const brandMatch = state.selectedBrand === 'all' || p.brand === state.selectedBrand;
    
    return nameMatch && priceMatch && brandMatch;
  });

  if (state.sortOrder === 'desc') {
    state.filteredProducts.sort((a, b) => {
      const aPrice = a.price_stats?.min_price || 999999;
      const bPrice = b.price_stats?.min_price || 999999;
      return bPrice - aPrice;
    });
  }

  const totalPages = Math.ceil(state.filteredProducts.length / state.pageSize);
  const startIdx = (state.currentPage - 1) * state.pageSize;
  const endIdx = startIdx + state.pageSize;
  const paginatedProducts = state.filteredProducts.slice(startIdx, endIdx);

  renderProducts(paginatedProducts, state.filteredProducts.length, totalPages);
}

// ============ FAVORITES ============
function toggleFavorite(productId, e) {
  e.stopPropagation();
  const idx = state.favorites.indexOf(productId);
  if (idx > -1) {
    state.favorites.splice(idx, 1);
  } else {
    state.favorites.push(productId);
  }
  localStorage.setItem('favorites', JSON.stringify(state.favorites));
  filterAndRenderProducts();
}

function isFavorited(productId) {
  return state.favorites.includes(productId);
}

// ============ PRODUCT RENDERING ============
function renderProducts(products, totalFiltered, totalPages) {
  const content = document.getElementById('content');
  
  if (state.allProducts.length === 0) {
    content.innerHTML = '<p style="color: #666;">No products found</p>';
    return;
  }

  if (products.length === 0) {
    content.innerHTML = '<p style="color: #666;">No products match your filters</p>';
    return;
  }

  document.querySelector('.product-count').textContent = 
    `(${totalFiltered} total, page ${state.currentPage}/${totalPages})`;

  const minPriceAll = Math.min(...state.allProducts.map(p => p.price_stats?.min_price || 999999));

  content.innerHTML = `
    <div class="products-grid">
      ${products.map(p => {
        const cheapestRetailer = p.retailer_prices?.length > 0 
          ? p.retailer_prices.reduce((a, b) => (a.price || 999999) < (b.price || 999999) ? a : b)
          : null;
        
        const isPriceLeader = p.price_stats?.min_price === minPriceAll;
        const isFav = isFavorited(getProductId(p));
        const inCompare = isInCompare(getProductId(p));

        return `
          <div class="product-card">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; gap: 8px;">
              <div class="product-name" style="flex: 1;">${p.name}</div>
              <div style="display: flex; gap: 4px;">
                <button class="favorite-btn ${isFav ? 'favorited' : ''}" onclick="toggleFavorite('${getProductId(p)}', event)" title="Favorite">
                  ${isFav ? '★' : '☆'}
                </button>
                <button class="favorite-btn ${inCompare ? 'favorited' : ''}" onclick="toggleCompare('${getProductId(p)}', event)" title="Compare" style="color: ${inCompare ? '#28a745' : '#999'}">
                  ⚖
                </button>
              </div>
            </div>
            ${p.image_url ? `<img src="${p.image_url}" alt="${p.name}" class="product-img" loading="lazy">` : ''}
            ${p.brand ? `<div class="product-brand">Brand: ${p.brand}</div>` : ''}
            ${p.price_stats ? `
              <div class="price-highlight" ${isPriceLeader ? 'style="border: 2px solid #ffc107;"' : ''}>
                <strong>Min: €${p.price_stats.min_price?.toFixed(2)}</strong><br>
                <strong>Avg: €${p.price_stats.avg_price?.toFixed(2)}</strong><br>
                <strong>Max: €${p.price_stats.max_price?.toFixed(2)}</strong>
              </div>
            ` : ''}
            ${p.retailer_prices && p.retailer_prices.length > 0 ? `
              <div class="retailers">
                <div class="retailers-title">Retailers:</div>
                ${p.retailer_prices.map(r => `
                  <div class="retailer ${cheapestRetailer?.retailer_display_name === r.retailer_display_name ? 'cheapest' : ''}">
                    <span>${r.retailer_display_name}</span>
                    <strong>€${r.price?.toFixed(2)}</strong>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>
    
    ${totalPages > 1 ? `
      <div class="pagination">
        <button onclick="goToPage(1)" ${state.currentPage === 1 ? 'disabled' : ''}>« First</button>
        <button onclick="goToPage(${state.currentPage - 1})" ${state.currentPage === 1 ? 'disabled' : ''}>‹ Prev</button>
        ${Array.from({length: totalPages}, (_, i) => i + 1)
          .filter(p => Math.abs(p - state.currentPage) <= 2 || p === 1 || p === totalPages)
          .map((p, i, arr) => {
            if (i > 0 && arr[i-1] !== p - 1) return '<span>...</span>';
            return `<button onclick="goToPage(${p})" class="${p === state.currentPage ? 'active' : ''}">${p}</button>`;
          }).join('')}
        <button onclick="goToPage(${state.currentPage + 1})" ${state.currentPage === totalPages ? 'disabled' : ''}>Next ›</button>
        <button onclick="goToPage(${totalPages})" ${state.currentPage === totalPages ? 'disabled' : ''}>Last »</button>
      </div>
    ` : ''}
  `;
}

function goToPage(page) {
  const totalPages = Math.ceil(state.filteredProducts.length / state.pageSize);
  if (page < 1 || page > totalPages) return;
  state.currentPage = page;
  filterAndRenderProducts();
  window.scrollTo({top: 0, behavior: 'smooth'});
}

// ============ UI FEEDBACK ============
function showLoading() {
  document.getElementById('content').innerHTML = '<div class="loading">Loading products...</div>';
}

function showError(msg) {
  document.getElementById('content').innerHTML = `<div class="error">${msg}</div>`;
}

init();
