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
      // API max page_size is 100, cap user selection
      const limitedPageSize = Math.min(pageSize, 100);
      const res = await fetch(
        `${this.WORKER_URL}/products?page=${page}&page_size=${limitedPageSize}&category=${catId}`
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
  priceMax: 0, // Will be set by category
  favorites: JSON.parse(localStorage.getItem('favorites') || '[]'),
  compareProducts: JSON.parse(localStorage.getItem('compareProducts') || '[]'),
  selectedBrand: 'all',
  selectedRetailers: new Set(JSON.parse(localStorage.getItem('selectedRetailers') || '[]')),
  recentlyViewed: JSON.parse(localStorage.getItem('recentlyViewed') || '[]'),
  categoryPriceRange: { min: 0, max: 0 } // Original min/max before filtering
};

// ============ UTILITIES ============
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function debounce(fn, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// ============ URL STATE MANAGEMENT ============
const debouncedUpdateUrlState = debounce(updateUrlState, 500);

function updateUrlState() {
  const params = new URLSearchParams();
  if (state.selectedCategoryId) params.set('category', state.selectedCategoryId);
  const search = document.getElementById('searchInput')?.value;
  if (search) params.set('search', search);
  if (state.currentPage > 1) params.set('page', state.currentPage);
  if (state.priceMin > state.categoryPriceRange.min) params.set('minPrice', state.priceMin);
  if (state.priceMax < state.categoryPriceRange.max) params.set('maxPrice', state.priceMax);
  if (state.selectedBrand !== 'all') params.set('brand', state.selectedBrand);
  if (state.sortOrder !== 'asc') params.set('sort', state.sortOrder);
  if (state.selectedRetailers.size > 0) params.set('retailers', Array.from(state.selectedRetailers).join(','));

  const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
  window.history.replaceState(null, '', newUrl);
}

function loadUrlState() {
  const params = new URLSearchParams(window.location.search);

  if (params.has('category')) {
    const catId = params.get('category');
    const catName = state.allProducts[0]?.category_name || 'Category';
    state.selectedCategoryId = catId;
    state.selectedCategoryName = catName;
  }

  if (params.has('search')) {
    const search = params.get('search');
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = decodeURIComponent(search);
  }

  if (params.has('page')) {
    state.currentPage = parseInt(params.get('page')) || 1;
  }

  if (params.has('minPrice')) {
    state.priceMin = parseFloat(params.get('minPrice')) || state.categoryPriceRange.min;
    const priceMin = document.getElementById('priceMin');
    if (priceMin) priceMin.value = state.priceMin;
  }

  if (params.has('maxPrice')) {
    state.priceMax = parseFloat(params.get('maxPrice')) || state.categoryPriceRange.max;
    const priceMax = document.getElementById('priceMax');
    if (priceMax) priceMax.value = state.priceMax;
  }

  if (params.has('brand')) {
    state.selectedBrand = params.get('brand');
    const brandFilter = document.getElementById('brandFilter');
    if (brandFilter) brandFilter.value = state.selectedBrand;
  }

  if (params.has('retailers')) {
    const retailers = params.get('retailers').split(',').filter(r => r);
    state.selectedRetailers = new Set(retailers);
    updateRetailerCheckboxes();
  }

  if (params.has('sort')) {
    state.sortOrder = params.get('sort');
    const sortOrder = document.getElementById('sortOrder');
    if (sortOrder) sortOrder.value = state.sortOrder;
  }
}

// ============ EXPORT FUNCTIONALITY ============
function exportCompareToCSV() {
  if (state.compareProducts.length === 0) {
    alert('No products to export');
    return;
  }

  const products = state.compareProducts.map(id =>
    state.allProducts.find(p => getProductId(p) === id)
  ).filter(p => p);

  let csv = 'Product Name,Brand,Min Price,Avg Price,Max Price,Retailers Count\n';
  products.forEach(p => {
    csv += `"${p.name}","${p.brand || ''}","${p.price_stats?.min_price || 'N/A'}","${p.price_stats?.avg_price || 'N/A'}","${p.price_stats?.max_price || 'N/A'}","${p.retailer_prices?.length || 0}"\n`;
  });

  downloadCSV(csv, 'compare-results.csv');
}

function exportFavoritesToCSV() {
  if (state.favorites.length === 0) {
    alert('No favorites to export');
    return;
  }

  const products = state.favorites.map(id =>
    state.allProducts.find(p => getProductId(p) === id)
  ).filter(p => p);

  let csv = 'Product Name,Brand,Min Price,Avg Price,Max Price,Retailers Count\n';
  products.forEach(p => {
    csv += `"${p.name}","${p.brand || ''}","${p.price_stats?.min_price || 'N/A'}","${p.price_stats?.avg_price || 'N/A'}","${p.price_stats?.max_price || 'N/A'}","${p.retailer_prices?.length || 0}"\n`;
  });

  downloadCSV(csv, 'favorites.csv');
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

// ============ KEYBOARD SHORTCUTS ============
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Escape closes modals
    if (e.key === 'Escape') {
      document.getElementById('compareModal')?.classList.remove('open');
      document.getElementById('detailModal')?.classList.remove('open');
      return;
    }

    // Only if not typing in input
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') {
      return;
    }

    // / = focus search
    if (e.key === '/') {
      e.preventDefault();
      document.getElementById('searchInput')?.focus();
      return;
    }

    // c = clear filters
    if (e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      clearFilters();
      return;
    }

    // ? = show help
    if (e.shiftKey && e.key === '?') {
      e.preventDefault();
      showKeyboardHelp();
      return;
    }

    // n = next page
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey) {
      const btn = document.querySelector('.pagination button[data-page]:not(:disabled)');
      if (btn && parseInt(btn.getAttribute('data-page')) === state.currentPage + 1) {
        goToPage(state.currentPage + 1);
      }
      return;
    }

    // p = previous page
    if (e.key === 'p' && !e.ctrlKey && !e.metaKey) {
      if (state.currentPage > 1) {
        goToPage(state.currentPage - 1);
      }
      return;
    }
  });
}

function showKeyboardHelp() {
  const helpText = `
⌨️ Keyboard Shortcuts:

/ = Focus search
c = Clear all filters
n = Next page
p = Previous page
? = Show this help
Esc = Close modals
  `.trim();
  alert(helpText);
}

// Make help hint clickable
function setupHelpHint() {
  const hint = document.querySelector('.keyboard-hint');
  if (hint) {
    hint.style.cursor = 'pointer';
    hint.addEventListener('click', showKeyboardHelp);
  }
}

async function init() {
  try {
    const categories = await API.getCategories();
    renderCategories(categories);
    setupKeyboardShortcuts();
    setupEventListeners();
    setupContentEventListener();
    setupHelpHint();
    updateFavoritesButton();
    updateCompareButton();

    // Set initial theme toggle text
    const themeToggle = document.getElementById('themeToggle');
    themeToggle.textContent = state.darkMode ? '☀ Light' : '🌙 Dark';

    // Load URL state AFTER categories rendered
    const params = new URLSearchParams(window.location.search);
    if (params.has('category')) {
      const catId = params.get('category');
      const catBtn = document.querySelector(`button[data-category-id="${catId}"]`);
      if (catBtn) {
        catBtn.click();
      }
    }
  } catch (err) {
    showError('Failed to load categories: ' + err.message);
  }
}

// ============ FILTER UTILITIES ============
function clearFilters() {
  const searchInput = document.getElementById('searchInput');
  searchInput.value = '';
  searchInput.blur();

  const priceMinInput = document.getElementById('priceMin');
  const priceMaxInput = document.getElementById('priceMax');

  priceMinInput.value = state.categoryPriceRange.min.toFixed(2);
  priceMaxInput.value = state.categoryPriceRange.max.toFixed(2);
  document.getElementById('brandFilter').value = 'all';
  document.getElementById('pageSize').value = '50';
  document.getElementById('sortOrder').value = 'asc';

  state.priceMin = state.categoryPriceRange.min;
  state.priceMax = state.categoryPriceRange.max;
  state.selectedBrand = 'all';
  state.selectedRetailers.clear();
  state.pageSize = 50;
  state.sortOrder = 'asc';
  state.currentPage = 1;

  updateRetailerCheckboxes();
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
  const clearRetailersBtn = document.getElementById('clearRetailers');

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
      let value = parseFloat(priceMinInput.value);
      if (isNaN(value)) return;

      const minAllowed = state.categoryPriceRange.min;
      const maxAllowed = state.priceMax;

      value = Math.max(minAllowed, Math.min(value, maxAllowed));
      value = Math.round(value * 100) / 100;

      state.priceMin = value;
      priceMinInput.value = value.toFixed(2);
      state.currentPage = 1;
      filterAndRenderProducts();
    }, 300));

    priceMaxInput.addEventListener('input', debounce(() => {
      let value = parseFloat(priceMaxInput.value);
      if (isNaN(value)) return;

      const minAllowed = state.priceMin;
      const maxAllowed = state.categoryPriceRange.max;

      value = Math.max(minAllowed, Math.min(value, maxAllowed));
      value = Math.round(value * 100) / 100;

      state.priceMax = value;
      priceMaxInput.value = value.toFixed(2);
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

  // Clear retailers
  if (clearRetailersBtn) {
    clearRetailersBtn.addEventListener('click', () => {
      state.selectedRetailers.clear();
      state.currentPage = 1;
      updateRetailerCheckboxes();
      filterAndRenderProducts();
    });
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
    btn.setAttribute('data-category-id', cat.category_id);
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

async function selectCategory(catId, catName) {
  state.selectedCategoryId = catId;
  state.selectedCategoryName = catName;
  state.currentPage = 1;

  document.getElementById('selectedCatName').textContent = catName;
  document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');

  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('searchInput').value = '';
  state.selectedBrand = 'all';
  state.selectedRetailers.clear();
  document.getElementById('brandFilter').value = 'all';

  showLoading();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  try {
    const data = await API.getProducts(catId, 1, 1000, 'asc');
    state.allProducts = data.products || [];

    // Update price range dynamically based on category
    const prices = state.allProducts
      .map(p => p.price_stats?.min_price)
      .filter(p => p !== undefined && p !== null);

    const categoryMin = Math.min(...prices);
    const categoryMax = Math.max(...prices);
    const roundedMin = Math.round(categoryMin * 100) / 100;
    const roundedMax = Math.round(categoryMax * 100) / 100;

    state.categoryPriceRange = { min: roundedMin, max: roundedMax };
    state.priceMin = roundedMin;
    state.priceMax = roundedMax;

    const priceMinInput = document.getElementById('priceMin');
    const priceMaxInput = document.getElementById('priceMax');

    if (priceMinInput && priceMaxInput) {
      priceMinInput.min = roundedMin;
      priceMinInput.max = roundedMax;
      priceMinInput.value = roundedMin.toFixed(2);
      priceMinInput.placeholder = `Min (€${roundedMin.toFixed(2)})`;

      priceMaxInput.min = roundedMin;
      priceMaxInput.max = roundedMax;
      priceMaxInput.value = roundedMax.toFixed(2);
      priceMaxInput.placeholder = `Max (€${roundedMax.toFixed(2)})`;
    }

    document.getElementById('priceDisplay').textContent = roundedMin.toFixed(2);
    document.getElementById('priceDisplayMax').textContent = roundedMax.toFixed(2);

    updateBrandOptions();
    updateRetailerOptions();
    filterAndRenderProducts();
  } catch (err) {
    showError('Failed to load products: ' + err.message);
  }
}

function trackRecentlyViewed(productId, productName) {
  const entry = { id: productId, name: productName, time: Date.now() };
  const idx = state.recentlyViewed.findIndex(p => p.id === productId);
  if (idx > -1) state.recentlyViewed.splice(idx, 1);
  state.recentlyViewed.unshift(entry);
  if (state.recentlyViewed.length > 20) state.recentlyViewed.pop();
  localStorage.setItem('recentlyViewed', JSON.stringify(state.recentlyViewed));
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

  // Fetch fresh product data from API for compare products
  const modal = document.getElementById('compareModal');
  const table = document.getElementById('compareTable');

  // Show loading
  table.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #999;">Loading...</td></tr>';
  modal.classList.add('open');

  // Fetch all products to find compare items
  const promises = state.compareProducts.map(productId => {
    // Search for product in allProducts first
    const product = state.allProducts.find(p => getProductId(p) === productId);
    if (product) {
      return Promise.resolve(product);
    }
    // If not found in current category, return null (product may be from different category)
    return Promise.resolve(null);
  });

  Promise.all(promises).then(products => {
    const validProducts = products.filter(p => p);

    if (validProducts.length === 0) {
      table.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #999;">Products not found. They may be from a different category.</td></tr>';
      return;
    }

    let html = `
      <tr>
        <th>Property</th>
        ${validProducts.map(p => `<th>${escapeHtml(p.name)}</th>`).join('')}
      </tr>
      <tr>
        <td>Brand</td>
        ${validProducts.map(p => `<td>${escapeHtml(p.brand || 'N/A')}</td>`).join('')}
      </tr>
      <tr>
        <td>Min Price</td>
        ${validProducts.map(p => `<td class="compare-price">€${p.price_stats?.min_price?.toFixed(2) || 'N/A'}</td>`).join('')}
      </tr>
      <tr>
        <td>Avg Price</td>
        ${validProducts.map(p => `<td>€${p.price_stats?.avg_price?.toFixed(2) || 'N/A'}</td>`).join('')}
      </tr>
      <tr>
        <td>Max Price</td>
        ${validProducts.map(p => `<td>€${p.price_stats?.max_price?.toFixed(2) || 'N/A'}</td>`).join('')}
      </tr>
      <tr>
        <td>Retailers</td>
        ${validProducts.map(p => `<td>${p.retailer_prices?.length || 0}</td>`).join('')}
      </tr>
      <tr>
        <td>Action</td>
        ${validProducts.map(p => `
          <td>
            <button class="compare-remove" data-product-id="${escapeHtml(getProductId(p))}" data-action="remove-compare">Remove</button>
          </td>
        `).join('')}
      </tr>
    `;

    table.innerHTML = html;

    // Event delegation for compare modal remove buttons
    table.removeEventListener('click', handleCompareRemove);
    table.addEventListener('click', handleCompareRemove);
  }).catch(err => {
    table.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: #999;">Error loading products</td></tr>`;
  });
}

function handleCompareRemove(e) {
  if (e.target.hasAttribute('data-action') && e.target.getAttribute('data-action') === 'remove-compare') {
    const productId = e.target.getAttribute('data-product-id');
    const idx = state.compareProducts.indexOf(productId);
    if (idx > -1) {
      state.compareProducts.splice(idx, 1);
      localStorage.setItem('compareProducts', JSON.stringify(state.compareProducts));
      updateCompareButton();
      if (state.compareProducts.length === 0) {
        closeCompareModal();
      } else {
        openCompareModal();
      }
    }
  }
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
      brands.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
    select.value = current;
  }
}

// ============ RETAILER FILTER ============
function updateRetailerOptions() {
  const retailers = [...new Set(state.allProducts
    .flatMap(p => p.retailer_prices?.map(r => r.retailer_display_name) || [])
    .filter(r => r)
  )].sort();

  const container = document.getElementById('retailerCheckboxes');
  if (container) {
    container.innerHTML = retailers.map(retailer => `
      <div class="retailer-checkbox">
        <input type="checkbox" id="retailer-${escapeHtml(retailer)}" value="${escapeHtml(retailer)}" 
          ${state.selectedRetailers.has(retailer) ? 'checked' : ''}>
        <label for="retailer-${escapeHtml(retailer)}">${escapeHtml(retailer)}</label>
      </div>
    `).join('');

    // Add event listeners
    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          state.selectedRetailers.add(e.target.value);
        } else {
          state.selectedRetailers.delete(e.target.value);
        }
        localStorage.setItem('selectedRetailers', JSON.stringify(Array.from(state.selectedRetailers)));
        state.currentPage = 1;
        filterAndRenderProducts();
      });
    });
  }
}

function updateRetailerCheckboxes() {
  const container = document.getElementById('retailerCheckboxes');
  if (container) {
    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
      checkbox.checked = state.selectedRetailers.has(checkbox.value);
    });
  }
}

function filterAndRenderProducts() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();

  // Filter by search, price, brand, and retailers
  state.filteredProducts = state.allProducts.filter(p => {
    const nameMatch = p.name.toLowerCase().includes(searchTerm) ||
      (p.brand && p.brand.toLowerCase().includes(searchTerm));

    const minPrice = p.price_stats?.min_price || 0;
    const priceMatch = minPrice >= state.priceMin && minPrice <= state.priceMax;

    const brandMatch = state.selectedBrand === 'all' || p.brand === state.selectedBrand;

    // Retailer filter: show product only if it has selected retailers (or no retailers selected)
    let retailerMatch = true;
    if (state.selectedRetailers.size > 0) {
      const productRetailers = p.retailer_prices?.map(r => r.retailer_display_name) || [];
      retailerMatch = productRetailers.some(r => state.selectedRetailers.has(r));
    }

    return nameMatch && priceMatch && brandMatch && retailerMatch;
  });

  // Recalculate price range if retailers filtered
  if (state.selectedRetailers.size > 0) {
    const filteredPrices = state.filteredProducts
      .map(p => {
        // Calculate min/max/avg for selected retailers only
        const selectedPrices = p.retailer_prices
          ?.filter(r => state.selectedRetailers.has(r.retailer_display_name))
          .map(r => r.price) || [];

        if (selectedPrices.length === 0) return null;
        return {
          min: Math.min(...selectedPrices),
          max: Math.max(...selectedPrices),
          avg: selectedPrices.reduce((a, b) => a + b) / selectedPrices.length
        };
      })
      .filter(p => p !== null);

    if (filteredPrices.length > 0) {
      const allMins = filteredPrices.map(p => p.min);
      const allMaxs = filteredPrices.map(p => p.max);
      const newMin = Math.min(...allMins);
      const newMax = Math.max(...allMaxs);

      // Update display to show filtered range
      document.getElementById('priceDisplay').textContent = newMin.toFixed(2);
      document.getElementById('priceDisplayMax').textContent = newMax.toFixed(2);
    }
  } else {
    // Reset to category range
    document.getElementById('priceDisplay').textContent = state.categoryPriceRange.min.toFixed(2);
    document.getElementById('priceDisplayMax').textContent = state.categoryPriceRange.max.toFixed(2);
  }

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

  debouncedUpdateUrlState();
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

// ============ PRODUCT DETAIL MODAL ============
function openProductDetailModal(product) {
  const modal = document.getElementById('detailModal');
  if (!modal) return;

  const retailersList = product.retailer_prices?.map(r => `
    <div style="padding: 8px 0; border-bottom: 1px solid #eee; display: flex; justify-content: space-between;">
      <span>${escapeHtml(r.retailer_display_name)}</span>
      <strong>€${r.price?.toFixed(2)}</strong>
    </div>
  `).join('') || '<p style="color: #999;">No pricing data</p>';

  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <button class="modal-close" id="detailClose" aria-label="Close detail modal">✕</button>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        <div>
          ${product.image_url ? `<img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}" style="width: 100%; border-radius: 4px;">` : '<div style="background: #e0e0e0; height: 200px; border-radius: 4px;"></div>'}
        </div>
        <div>
          <h2 style="margin: 0 0 8px; font-size: 18px;">${escapeHtml(product.name)}</h2>
          ${product.brand ? `<p style="margin: 0 0 16px;" class="product-brand">Brand: ${escapeHtml(product.brand)}</p>` : ''}
          
          <div style="background: #f9f9f9; padding: 12px; border-radius: 4px; margin-bottom: 16px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; text-align: center;">
              <div>
                <div style="font-size: 12px; color: #666;">Min</div>
                <strong style="font-size: 16px;">€${product.price_stats?.min_price?.toFixed(2) || 'N/A'}</strong>
              </div>
              <div>
                <div style="font-size: 12px; color: #666;">Avg</div>
                <strong style="font-size: 16px;">€${product.price_stats?.avg_price?.toFixed(2) || 'N/A'}</strong>
              </div>
              <div>
                <div style="font-size: 12px; color: #666;">Max</div>
                <strong style="font-size: 16px;">€${product.price_stats?.max_price?.toFixed(2) || 'N/A'}</strong>
              </div>
            </div>
          </div>
          
          <div>
            <strong>Available at ${product.retailer_prices?.length || 0} retailers:</strong>
            <div style="margin-top: 8px; max-height: 200px; overflow-y: auto; font-size: 13px;">
              ${retailersList}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('detailClose').addEventListener('click', () => {
    modal.classList.remove('open');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });

  modal.classList.add('open');
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

  const countEl = document.querySelector('.product-count');
  if (countEl) {
    countEl.textContent = `(${totalFiltered} total, page ${state.currentPage}/${totalPages})`;
  }

  const minPriceAll = Math.min(...state.allProducts.map(p => p.price_stats?.min_price || 999999));

  content.innerHTML = `
    <div class="products-grid">
      ${products.map((p, idx) => {
    const cheapestRetailer = p.retailer_prices?.length > 0
      ? p.retailer_prices.reduce((a, b) => (a.price || 999999) < (b.price || 999999) ? a : b)
      : null;

    const isPriceLeader = p.price_stats?.min_price === minPriceAll;
    const isFav = isFavorited(getProductId(p));
    const inCompare = isInCompare(getProductId(p));

    return `
          <div class="product-card" data-product-id="${escapeHtml(getProductId(p))}" data-product-idx="${idx}">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; gap: 8px;">
              <div class="product-name" style="flex: 1;">${escapeHtml(p.name)}</div>
              <div style="display: flex; gap: 4px;">
                <button class="favorite-btn ${isFav ? 'favorited' : ''}" data-action="favorite" title="Favorite">
                  ${isFav ? '★' : '☆'}
                </button>
                <button class="favorite-btn ${inCompare ? 'favorited' : ''}" data-action="compare" title="Compare" style="color: ${inCompare ? '#28a745' : '#999'}">
                  ⚖
                </button>
              </div>
            </div>
            ${p.image_url ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" class="product-img" loading="lazy">` : ''}
            ${p.brand ? `<div class="product-brand">Brand: ${escapeHtml(p.brand)}</div>` : ''}
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
                    <span>${escapeHtml(r.retailer_display_name)}</span>
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
        <button data-page="1" ${state.currentPage === 1 ? 'disabled' : ''}>« First</button>
        <button data-page="${state.currentPage - 1}" ${state.currentPage === 1 ? 'disabled' : ''}>‹ Prev</button>
        ${Array.from({ length: totalPages }, (_, i) => i + 1)
        .filter(p => Math.abs(p - state.currentPage) <= 2 || p === 1 || p === totalPages)
        .map((p, i, arr) => {
          if (i > 0 && arr[i - 1] !== p - 1) return '<span>...</span>';
          return `<button data-page="${p}" class="${p === state.currentPage ? 'active' : ''}">${p}</button>`;
        }).join('')}
        <button data-page="${state.currentPage + 1}" ${state.currentPage === totalPages ? 'disabled' : ''}>Next ›</button>
        <button data-page="${totalPages}" ${state.currentPage === totalPages ? 'disabled' : ''}>Last »</button>
      </div>
    ` : ''}
  `;

  // Event delegation for product actions and pagination
}

function goToPage(page) {
  const totalPages = Math.ceil(state.filteredProducts.length / state.pageSize);
  if (page < 1 || page > totalPages) return;
  state.currentPage = page;
  filterAndRenderProducts();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============ UI FEEDBACK ============
function showLoading() {
  document.getElementById('content').innerHTML = '<div class="loading">Loading products...</div>';
}

function showError(msg) {
  document.getElementById('content').innerHTML = `<div class="error">${msg}</div>`;
}

init();

// Single event listener on #content (added in init, reused on all renders)
function setupContentEventListener() {
  const content = document.getElementById('content');
  if (!content) return;

  content.addEventListener('click', (e) => {
    const productCard = e.target.closest('[data-product-id]');
    if (productCard) {
      if (e.target.hasAttribute('data-action')) {
        const action = e.target.getAttribute('data-action');
        const productId = productCard.getAttribute('data-product-id');
        if (action === 'favorite') {
          toggleFavorite(productId, e);
        } else if (action === 'compare') {
          toggleCompare(productId, e);
        }
      } else if (!e.target.closest('button')) {
        const productId = productCard.getAttribute('data-product-id');
        const product = state.allProducts.find(p => getProductId(p) === productId);
        if (product) {
          trackRecentlyViewed(productId, product.name);
          openProductDetailModal(product);
        }
      }
    }

    const pageBtn = e.target.closest('button[data-page]');
    if (pageBtn && !pageBtn.disabled) {
      const page = parseInt(pageBtn.getAttribute('data-page'));
      goToPage(page);
    }
  });
}

// ============ FAVORITES MODAL ============
function openFavoritesModal() {
  const modal = document.getElementById('favoritesModal');
  if (!modal) return;

  const favoriteProducts = state.favorites.map(id =>
    state.allProducts.find(p => getProductId(p) === id)
  ).filter(p => p);

  let html = '';

  if (favoriteProducts.length === 0) {
    html = '<p style="padding: 20px; text-align: center; color: #999;">No favorites yet. Click ★ on products to add them.</p>';
  } else {
    html = `
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px;">
        ${favoriteProducts.map(p => `
          <div class="product-card">
            ${p.image_url ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" class="product-img" loading="lazy">` : ''}
            <div style="flex-grow: 1;">
              <div class="product-name" style="margin: 8px 0; font-size: 13px;">${escapeHtml(p.name)}</div>
              ${p.brand ? `<div class="product-brand">Brand: ${escapeHtml(p.brand)}</div>` : ''}
              <div style="margin: 8px 0; padding: 8px; background: #fff3cd; border-radius: 4px;">
                <strong>€${p.price_stats?.min_price?.toFixed(2) || 'N/A'}</strong>
              </div>
            </div>
            <button class="export-btn" data-action="remove-fav" data-product-id="${escapeHtml(getProductId(p))}" style="width: 100%; margin-top: 8px; padding: 8px; background: #f8d7da; color: #721c24;">Remove</button>
          </div>
        `).join('')}
      </div>
    `;
  }

  modal.querySelector('.modal-content').innerHTML = `
    <button class="modal-close" id="favoritesClose">✕</button>
    <h2>My Favorites (${favoriteProducts.length})</h2>
    ${html}
    <button class="export-btn" onclick="exportFavoritesToCSV()" style="margin-top: 16px;">📥 Export Favorites</button>
  `;

  document.getElementById('favoritesClose').addEventListener('click', () => {
    modal.classList.remove('open');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });

  // Event delegation for remove buttons
  modal.querySelector('.modal-content').addEventListener('click', (e) => {
    if (e.target.hasAttribute('data-action') && e.target.getAttribute('data-action') === 'remove-fav') {
      const productId = e.target.getAttribute('data-product-id');
      toggleFavorite(productId, e);
      openFavoritesModal();
    }
  });

  modal.classList.add('open');
}

// Update favorites count and setup button
function updateFavoritesButton() {
  const btn = document.getElementById('favoritesBtn');
  const count = document.getElementById('favoritesCount');
  if (count) {
    count.textContent = state.favorites.length;
  }
  if (btn) {
    btn.addEventListener('click', openFavoritesModal);
  }
}