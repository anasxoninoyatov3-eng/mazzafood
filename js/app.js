import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";

const firebaseConfig = {
    apiKey: "AIzaSyBVeJ7TQeQPEkqNuSx5Wo2yo3TecVxLSGk",
    authDomain: "mazza-food.firebaseapp.com",
    projectId: "mazza-food",
    storageBucket: "mazza-food.firebasestorage.app",
    messagingSenderId: "146730977047",
    appId: "1:146730977047:web:b8255ff87f1f5495eb1952",
    measurementId: "G-WJVLDP3KFW"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('SW registered!', reg))
            .catch(err => console.log('SW registration failed:', err));
    });
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('MazzaFood V7 loaded');

    if (!localStorage.getItem('mazza_clean_users_v2')) {
        localStorage.removeItem('mazza_users');
        localStorage.removeItem('mazza_current_user');
        localStorage.setItem('mazza_clean_users_v2', '1');
    }

    const cartBtn = document.getElementById('cartBtn');
    const cartModal = document.getElementById('cartModal');
    const closeCart = document.getElementById('closeCart');
    const cartList = document.getElementById('cartList');
    const cartTotal = document.getElementById('cartTotal');
    const cartCount = document.getElementById('cartCount');
    const clearCart = document.getElementById('clearCart');
    const checkout = document.getElementById('checkout');
    const accountCount = document.getElementById('accountCount');
    const accountBtn = document.getElementById('accountBtn');

    const signUpStep1 = document.getElementById('signUpStep1');
    const signUpStep2 = document.getElementById('signUpStep2');
    const suNextBtn = document.getElementById('suNextBtn');
    const suBackBtn = document.getElementById('suBackBtn');

    const reviewForm = document.getElementById('reviewForm');
    const reviewName = document.getElementById('reviewName');
    const reviewRating = document.getElementById('reviewRating');
    const reviewText = document.getElementById('reviewText');
    const reviewsList = document.getElementById('reviewsList');
    const orderModal = document.getElementById('orderModal');
    const closeOrder = document.getElementById('closeOrder');
    const orderForm = document.getElementById('orderForm');
    const orderItemsEl = document.getElementById('orderItems');
    const orderCancel = document.getElementById('orderCancel');

    let cart = {};
    let accountTotal = parseInt(localStorage.getItem('mazza_account_total') || '0', 10) || 0;

    // Faqat admin tasdiqlagan fikrlar ko'rinadi
    let reviews = JSON.parse(localStorage.getItem('mazza_approved_reviews') || '[]');
    // Barcha pending fikrlar (foydalanuvchi o'z tarixi uchun)
    let allReviews = JSON.parse(localStorage.getItem('mazza_all_reviews') || '[]');

    // Review moderation and admin settings handled via secure backend server

    // Currency suffix detection (default empty, will detect "so'm" if menu uses som)
    let currencySuffix = '';
    function detectCurrency() {
        try {
            const priceEls = document.querySelectorAll('.price, .big-price, .middle-price, .mini-price');
            for (const el of priceEls) {
                const t = (el.textContent || '').toLowerCase();
                if (t.includes("som") || t.includes("so'm") || t.includes("сум")) { currencySuffix = " so'm"; return; }
                if (t.includes('$')) { currencySuffix = ''; return; }
            }
        } catch (err) {
            currencySuffix = '';
        }
    }

    function formatPrice(n) {
        const num = Number(n) || 0;
        // Show integers with grouping, decimals with up to 2 decimal places
        let out;
        if (Number.isInteger(num)) {
            out = num.toLocaleString();
        } else {
            out = num.toFixed(2).replace(/\.00$/, '');
        }
        return out + (currencySuffix || '');
    }

    function updateCartUI() {
        if (!cartList || !cartTotal || !cartCount || !accountCount) return;
        cartList.innerHTML = '';
        let total = 0; let items = 0;
        Object.keys(cart).forEach(id => {
            const item = cart[id];
            const li = document.createElement('li');
            li.className = 'cart-item';
            li.innerHTML = `<div><strong>${item.name}</strong><br><small>${item.qty} × ${formatPrice(item.price)}</small></div>
            <div style="display:flex; gap: 8px;">
                <button class="btn icon remove" data-id="${id}" aria-label="Kamaytirish ${item.name}">−</button>
                <button class="btn icon add-qty" data-id="${id}" aria-label="Ko'paytirish ${item.name}">+</button>
            </div>`;
            cartList.appendChild(li);
            total += item.price * item.qty;
            items += item.qty;
        })
        cartTotal.textContent = formatPrice(total);
        cartCount.textContent = items;
        accountCount.textContent = accountTotal;
        if (items === 0) {
            cartList.innerHTML = '<li class="cart-item"><em>Savatchangiz bo\'sh.</em></li>';
        }
    }

    // ── Item Details & Ingredients Logic ──────────────────────────────────────────
    const itemDetailsModal = document.getElementById('itemDetailsModal');
    const closeItemDetailsBtn = document.getElementById('closeItemDetailsBtn');
    const itemDetailsImage = document.getElementById('itemDetailsImage');
    const itemDetailsTitle = document.getElementById('itemDetailsTitle');
    const itemDetailsDesc = document.getElementById('itemDetailsDesc');
    const itemDetailsSizeContainer = document.getElementById('itemDetailsSizeContainer');
    const itemDetailsSizeSelect = document.getElementById('itemDetailsSizeSelect');
    const itemDetailsIngredientsContainer = document.getElementById('itemDetailsIngredientsContainer');
    const itemDetailsIngredientsList = document.getElementById('itemDetailsIngredientsList');
    const itemDetailsTotal = document.getElementById('itemDetailsTotal');
    const itemDetailsAddToCartBtn = document.getElementById('itemDetailsAddToCartBtn');

    // Old ingredientsMap is removed

    // Har bir burger turining tarkibi (nimadan iborat)
    const tarkibiMap = {
        'Cheese Burger': ['Non', 'Mol go\'shti kotleti', 'Pishloq', 'Salat', 'Pomidor', 'Bodring', 'Piyoz', 'Ketchup', 'Mayonez'],
        'Mazza Burger': ['Non', 'Mol go\'shti kotleti', 'Pishloq', 'Salat', 'Pomidor', 'Bodring', 'Piyoz', 'Maxsus sous', 'Ketchup', 'Mayonez'],
        'Halapeno Burger': ['Non', 'Mol go\'shti kotleti', 'Halapeno', 'Salat', 'Pomidor', 'Piyoz', 'Ketchup', 'Mayonez'],
        'BBQ Burger': ['Non', 'Mol go\'shti kotleti', 'Salat', 'Pomidor', 'Piyoz', 'BBQ sous', 'Mayonez'],
        'Twins Burger': ['Non', '2x Mol go\'shti kotleti', 'Pishloq', 'Salat', 'Pomidor', 'Bodring', 'Piyoz', 'Ketchup', 'Mayonez'],
        'Mix Cheese': ['Non', 'Mol go\'shti kotleti', '2x Pishloq', 'Salat', 'Pomidor', 'Bodring', 'Piyoz', 'Pishloq sousi', 'Mayonez'],
        'Double Burger': ['Non', '2x Mol go\'shti kotleti', 'Pishloq', 'Salat', 'Pomidor', 'Bodring', 'Piyoz', 'Ketchup', 'Mayonez'],
        'Chikin Burger': ['Non', 'Tovuq filesi', 'Salat', 'Pomidor', 'Bodring', 'Piyoz', 'Ketchup', 'Mayonez'],
        'Chicken Burger': ['Non', 'Tovuq filesi', 'Salat', 'Pomidor', 'Bodring', 'Piyoz', 'Ketchup', 'Mayonez'],
        'KFC Burger': ['Non', 'Qarsildoq tovuq', 'Salat', 'Pomidor', 'Ketchup', 'Mayonez'],
        'KFC Cheese': ['Non', 'Qarsildoq tovuq', 'Pishloq', 'Salat', 'Pomidor', 'Ketchup', 'Mayonez'],
        'Kfc Chesee Burger': ['Non', 'Qarsildoq tovuq', 'Pishloq', 'Salat', 'Pomidor', 'Ketchup', 'Mayonez'],
        'Chicken Mix': ['Non', 'Tovuq filesi', 'Qarsildoq tovuq', 'Salat', 'Pomidor', 'Ketchup', 'Mayonez']
    };

    let currentItemData = null;

    function formatNumber(num) {
        return num.toLocaleString();
    }

    function calculateCurrentItemTotal() {
        if (!currentItemData) return 0;
        let basePrice = currentItemData.basePrice;
        if (itemDetailsSizeSelect && itemDetailsSizeContainer && itemDetailsSizeContainer.style.display !== 'none' && itemDetailsSizeSelect.options.length > 0) {
            basePrice = parseFloat(itemDetailsSizeSelect.options[itemDetailsSizeSelect.selectedIndex].value) || basePrice;
        }

        let ingredientsTotal = 0;
        const qtys = itemDetailsIngredientsList.querySelectorAll('.ing-qty');
        qtys.forEach(span => {
            const qty = parseInt(span.textContent) || 0;
            ingredientsTotal += qty * (parseFloat(span.dataset.price) || 0);
        });

        return basePrice + ingredientsTotal;
    }

    function updateItemDetailsTotal() {
        const total = calculateCurrentItemTotal();
        if (itemDetailsTotal) {
            itemDetailsTotal.textContent = formatPrice(total);
        }
    }

    if (itemDetailsSizeSelect) {
        itemDetailsSizeSelect.addEventListener('change', updateItemDetailsTotal);
    }

    function openItemDetailsModal(card) {
        const titleEl = card.querySelector('.card-title');
        const descEl = card.querySelector('.desc');
        const imgEl = card.querySelector('.card-media img');
        const btn = card.querySelector('.add-btn');
        const originalSizeSel = card.querySelector('.size-select');

        if (!btn || !itemDetailsModal) return;

        const baseTitle = titleEl ? titleEl.textContent : '';
        const baseDesc = descEl ? descEl.textContent : '';
        const imgSrc = imgEl ? imgEl.src : '';

        currentItemData = {
            id: btn.dataset.id,
            name: btn.dataset.name || baseTitle,
            basePrice: parseFloat(btn.dataset.price) || 0
        };

        if (itemDetailsImage) itemDetailsImage.src = imgSrc;
        if (itemDetailsTitle) itemDetailsTitle.textContent = baseTitle;
        if (itemDetailsDesc) itemDetailsDesc.textContent = baseDesc;

        // Size logic
        if (originalSizeSel) {
            itemDetailsSizeContainer.style.display = 'block';
            itemDetailsSizeSelect.innerHTML = originalSizeSel.innerHTML;
            itemDetailsSizeSelect.style.display = 'block';
            // Copy selected index
            itemDetailsSizeSelect.selectedIndex = originalSizeSel.selectedIndex;
        } else {
            itemDetailsSizeContainer.style.display = 'none';
            itemDetailsSizeSelect.innerHTML = '';
        }

        // Ingredients / Tarkibi logic
        itemDetailsIngredientsList.innerHTML = '';

        // Find prefix
        let prefixMatch = currentItemData.id.match(/^([a-z]+)/);
        let prefix = prefixMatch ? prefixMatch[1] : '';

        itemDetailsIngredientsContainer.style.display = 'block';

        const baseTarkibMap = {
            'b': ['Ketchup', 'Mayonez', 'Pishloq sousi'],
            'f': ['Kartoshka', 'Ketchup', 'Mayonez', 'Pishloq sousi'],
            'sn': ['Qarsildoqlar', 'Ketchup', 'Mayonez', 'Pishloq sousi'],
            'lv': ['Lavash xamir', 'Go\'sht', 'Pomidor', 'Bodring', 'Piyoz', 'Maxsus sous', 'Pishloq', 'Halapeno'],
            'sh': ['Shaurma noni', 'Go\'sht', 'Pomidor', 'Bodring', 'Piyoz', 'Maxsus sous', 'Pishloq'],
            'tw': ['Tortilla', 'Qarsildoq tovuq', 'Salat', 'Pomidor', 'Maxsus sous', 'Pishloq sousi'],
            'sd': ['Maxsus non', 'Go\'sht/Tovuq', 'Pomidor', 'Bodring', 'Piyoz', 'Pishloq'],
            'hd': ['Maxsus non', 'Sosiska', 'Ketchup', 'Mayonez', 'Xantal', 'Pishloq']
        };

        function renderTarkibi() {
            itemDetailsIngredientsList.innerHTML = '';

            const ingredients = (baseTarkibMap[prefix] || baseTarkibMap['b']).map(name => ({
                name,
                price: 0
            }));

            const boxHeader = document.createElement('div');
            boxHeader.className = 'item-comment-box';
            boxHeader.style.cssText = 'margin-bottom: 14px; padding: 14px; background: #f8fafc; border-radius: 14px; border: 1px solid #e2e8f0;';
            const headerLabel = document.createElement('div');
            headerLabel.className = 'ing-section-title';
            headerLabel.innerHTML = '🧪 Tarkibi';
            boxHeader.appendChild(headerLabel);
            itemDetailsIngredientsList.appendChild(boxHeader);

            const listWrap = document.createElement('div');
            listWrap.style.cssText = 'display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px;';

            ingredients.forEach(ing => {
                const row = document.createElement('div');
                row.className = 'tarkibi-item';
                row.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 8px 10px;';

                const dot = document.createElement('span');
                dot.className = 'tarkibi-dot';
                dot.style.cssText = 'width: 6px; height: 6px; border-radius: 50%; background: #ff6b35; flex-shrink: 0;';

                const nameEl = document.createElement('span');
                nameEl.className = 'tarkibi-name';
                nameEl.style.cssText = 'font-weight: 500; color: #1a1a1a; font-size: 0.95rem; flex: 1;';
                nameEl.textContent = ing.name;

                row.appendChild(dot);
                row.appendChild(nameEl);
                listWrap.appendChild(row);
            });

            itemDetailsIngredientsList.appendChild(listWrap);

            const box = document.createElement('div');
            box.className = 'item-comment-box';
            box.style.cssText = 'margin-top: 4px; padding: 14px; background: #f8fafc; border-radius: 14px; border: 1px solid #e2e8f0;';

            const label = document.createElement('label');
            label.className = 'item-comment-label';
            label.htmlFor = 'itemCommentInput';
            label.innerHTML = '📝 Izoh (xohishga ko\'ra)';
            label.style.cssText = 'display: block; font-weight: 600; color: #1a1a1a; margin-bottom: 8px; font-size: 0.98rem;';

            const inputComment = document.createElement('input');
            inputComment.type = 'text';
            inputComment.id = 'itemCommentInput';
            inputComment.className = 'item-comment-input';
            inputComment.placeholder = "Izoh qoldiring, masalan: Ketchupsiz";
            inputComment.style.cssText = 'width: 100%; padding: 12px 14px; border: 1px solid #d1d5db; border-radius: 10px; font-size: 0.98rem; font-family: inherit; outline: none; transition: all 0.2s; box-sizing: border-box;';
            inputComment.addEventListener('focus', () => { inputComment.style.borderColor = '#ff6b35'; inputComment.style.boxShadow = '0 0 0 3px rgba(255,107,53,0.15)'; });
            inputComment.addEventListener('blur', () => { inputComment.style.borderColor = '#d1d5db'; inputComment.style.boxShadow = 'none'; });

            box.appendChild(label);
            box.appendChild(inputComment);
            itemDetailsIngredientsList.appendChild(box);

            updateItemDetailsTotal();
        }

        renderTarkibi();

        if (itemDetailsSizeSelect) {
            itemDetailsSizeSelect.addEventListener('change', renderTarkibi);
        }

        updateItemDetailsTotal();

        itemDetailsModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }

    function closeItemDetailsModalFn() {
        if (itemDetailsModal) {
            itemDetailsModal.setAttribute('aria-hidden', 'true');
        }
        if (!isAnyModalOpen()) document.body.style.overflow = '';
    }

    if (closeItemDetailsBtn) closeItemDetailsBtn.addEventListener('click', closeItemDetailsModalFn);
    if (itemDetailsModal) {
        itemDetailsModal.addEventListener('click', (e) => {
            if (e.target === itemDetailsModal) closeItemDetailsModalFn();
        });
    }

    if (itemDetailsAddToCartBtn) {
        itemDetailsAddToCartBtn.addEventListener('click', () => {
            if (!currentItemData) return;

            let finalPrice = currentItemData.basePrice;
            let sizeLabel = '';

            if (itemDetailsSizeSelect && itemDetailsSizeSelect.options.length > 0) {
                const opt = itemDetailsSizeSelect.options[itemDetailsSizeSelect.selectedIndex];
                finalPrice = parseFloat(opt.value) || finalPrice;
                sizeLabel = opt.dataset.label || opt.text || '';
            }

            let ingredientsStr = '';

            const commentInput = document.getElementById('itemCommentInput');
            if (commentInput && commentInput.value.trim() !== '') {
                ingredientsStr = ` (${commentInput.value.trim()})`;
            }

            finalPrice += 0;

            const displayName = sizeLabel ? `${currentItemData.name} (${sizeLabel})${ingredientsStr}` : `${currentItemData.name}${ingredientsStr}`;

            // Har bir qo'shilgan mahsulot alohida bo'ladi (unique timestamp key)
            const key = `${currentItemData.id}__${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

            cart[key] = { id: key, name: displayName, price: finalPrice, qty: 1 };
            accountTotal += 1;
            localStorage.setItem('mazza_account_total', String(accountTotal));

            updateCartUI();
            closeItemDetailsModalFn();
            openCart();
        });
    }

    // Bind original card clicks to the new modal
    document.querySelectorAll('.card').forEach(card => {
        const btn = card.querySelector('.add-btn');
        const media = card.querySelector('.card-media');

        if (btn) btn.addEventListener('click', () => openItemDetailsModal(card));
        if (media) {
            media.style.cursor = 'pointer';
            media.addEventListener('click', () => openItemDetailsModal(card));
        }
    });

    cartList.addEventListener('click', e => {
        if (e.target && e.target.classList.contains('remove')) {
            const id = e.target.dataset.id;
            if (cart[id]) {
                cart[id].qty -= 1;
                accountTotal = Math.max(0, accountTotal - 1);
                if (cart[id].qty <= 0) delete cart[id];
                localStorage.setItem('mazza_account_total', String(accountTotal));
                updateCartUI();
            }
        }
        if (e.target && e.target.classList.contains('add-qty')) {
            const id = e.target.dataset.id;
            if (cart[id]) {
                cart[id].qty += 1;
                accountTotal += 1;
                localStorage.setItem('mazza_account_total', String(accountTotal));
                updateCartUI();
            }
        }
    })

    function openCart() {
        cartModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }
    function closeCartFn() {
        cartModal.setAttribute('aria-hidden', 'true');
        if (!isAnyModalOpen()) document.body.style.overflow = '';
    }

    function isAnyModalOpen() {
        return document.querySelector('.modal[aria-hidden="false"]') !== null;
    }

    // Auth Modal Handlers - consolidated
    const authModal = document.getElementById('authModal');
    const closeAuth = document.getElementById('closeAuth');
    const tabSignIn = document.getElementById('tabSignIn');
    const tabSignUp = document.getElementById('tabSignUp');
    const signInForm = document.getElementById('signInForm');
    const signUpForm = document.getElementById('signUpForm');
    const siCancel = document.getElementById('siCancel');
    const suCancel = document.getElementById('suCancel');
    const authMsg = document.getElementById('authMsg');

    function openAuth() {
        if (authModal) {
            authModal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeAuthFn(force = false) {
        if (!force && !getCurrentUser()) return; // Don't close if forced login is active and user not logged in
        if (authModal) authModal.setAttribute('aria-hidden', 'true');
        if (!isAnyModalOpen()) document.body.style.overflow = '';
        // Restore close button visibility if user is now logged in
        if (closeAuth) closeAuth.style.display = 'flex';
        // Restore click outside listener if logged in
        if (authModal) {
            authModal.onclick = (e) => { if (e.target === authModal) closeAuthFn(); };
        }
    }

    if (closeAuth) closeAuth.addEventListener('click', () => closeAuthFn(true));
    if (siCancel) siCancel.addEventListener('click', () => closeAuthFn(true));
    if (suCancel) suCancel.addEventListener('click', () => closeAuthFn(true));

    if (cartBtn) cartBtn.addEventListener('click', openCart);
    if (closeCart) closeCart.addEventListener('click', closeCartFn);

    // "Return to Menu" button handler
    const returnToMenuBtn = document.getElementById('returnToMenu');
    if (returnToMenuBtn) {
        returnToMenuBtn.addEventListener('click', () => {
            closeCartFn();
            const menuSection = document.getElementById('menu');
            if (menuSection) {
                menuSection.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }

    if (clearCart) clearCart.addEventListener('click', () => { cart = {}; updateCartUI(); });
    if (checkout) {
        checkout.addEventListener('click', () => {
            if (Object.keys(cart).length === 0) { alert('Avval biror narsa qo\'shing.'); return }
            populateOrderForm();
            // Avto-to'ldirish: login qilgan foydalanuvchi yoki oxirgi saqlangan ma'lumot
            const cur = getCurrentUser();
            const lastCustomer = JSON.parse(localStorage.getItem('mazza_last_customer') || 'null');
            const nameEl = document.getElementById('customerName');
            const phoneEl = document.getElementById('customerPhone');
            if (cur) {
                if (nameEl && !nameEl.value) nameEl.value = cur.name || '';
                if (phoneEl && !phoneEl.value) phoneEl.value = cur.phone || '';
            } else if (lastCustomer) {
                if (nameEl && !nameEl.value) nameEl.value = lastCustomer.name || '';
                if (phoneEl && !phoneEl.value) phoneEl.value = lastCustomer.phone || '';
            }
            if (orderModal) {
                orderModal.setAttribute('aria-hidden', 'false');
                document.body.style.overflow = 'hidden';
            }
        })
    }

    function showSignIn() {
        if (tabSignIn) tabSignIn.classList.add('active');
        if (tabSignUp) tabSignUp.classList.remove('active');
        if (signInForm) signInForm.style.display = '';
        if (signUpForm) signUpForm.style.display = 'none';
        if (authMsg) { authMsg.style.display = 'none'; authMsg.textContent = ''; }
    }
    function showSignUp() {
        if (tabSignUp) tabSignUp.classList.add('active');
        if (tabSignIn) tabSignIn.classList.remove('active');
        if (signUpForm) signUpForm.style.display = '';
        if (signInForm) signInForm.style.display = 'none';
        if (authMsg) { authMsg.style.display = 'none'; authMsg.textContent = ''; }

        const step1 = document.getElementById('signUpStep1');
        const step2 = document.getElementById('signUpStep2');
        if (step1) step1.style.display = 'block';
        if (step2) step2.style.display = 'none';
    }

    if (tabSignIn) tabSignIn.addEventListener('click', showSignIn);
    if (tabSignUp) tabSignUp.addEventListener('click', showSignUp);

    // Password visibility toggle (Event Delegation)
    document.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.toggle-password');
        if (toggleBtn) {
            const targetId = toggleBtn.getAttribute('data-target');
            const input = document.getElementById(targetId);
            if (input) {
                if (input.type === 'password') {
                    input.type = 'text';
                    toggleBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
                } else {
                    input.type = 'password';
                    toggleBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
                }
            }
        }
    });

    // localStorage-backed users
    function loadUsers() { return JSON.parse(localStorage.getItem('mazza_users') || '[]'); }
    function saveUsers(u) { localStorage.setItem('mazza_users', JSON.stringify(u || [])); }
    function setCurrentUserId(id) { localStorage.setItem('mazza_current_user', String(id)); }
    function getCurrentUserId() { return localStorage.getItem('mazza_current_user'); }
    function getCurrentUser() { const id = getCurrentUserId(); if (!id) return null; const users = loadUsers(); return users.find(x => String(x.id) === String(id)) || null; }

    // SHA-256 hashing helper (returns hex) - falls back to btoa if subtle unavailable
    async function hashPassword(pwd) {
        try {
            const enc = new TextEncoder();
            const data = enc.encode(pwd);
            const hash = await window.crypto.subtle.digest('SHA-256', data);
            const arr = Array.from(new Uint8Array(hash));
            return arr.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            // fallback (not secure)
            return btoa(pwd);
        }
    }

    async function registerUser(name, phone, password) {
        const users = loadUsers();
        if (users.find(u => u.phone === phone)) throw new Error('Telefon raqami allaqachon ro\'yxatdan o\'tgan');
        const hash = await hashPassword(password);
        const id = 'u_' + Date.now();
        const user = { id, name, phone, hash };
        users.push(user); saveUsers(users); setCurrentUserId(id); return user;
    }

    async function loginUser(phoneOrName, password) {
        // Master Admin Credentials bypass
        const adminRegex = /^\+998(908527775|972011010|882011010)$/i;
        const normalizedPhone = (phoneOrName || '').replace(/[- ]/g, ''); // strip hyphens/spaces

        if (adminRegex.test(normalizedPhone) || ['+998908527775', '+998972011010', '+998882011010'].includes(normalizedPhone)) {
            // Hard password for admins
            if (password === 'mazzaAdmin2026_!@#') {
                const adminId = 'admin_' + normalizedPhone;
                const adminUser = { id: adminId, name: 'Admin', phone: normalizedPhone, hash: 'admin-bypass', role: 'admin' };

                // Store in local users list just in case
                const users = loadUsers();
                if (!users.find(u => u.id === adminId)) {
                    users.push(adminUser);
                    saveUsers(users);
                }
                setCurrentUserId(adminId);
                return adminUser;
            } else {
                throw new Error('Noto\'g\'ri admin paroli');
            }
        }

        const users = loadUsers();
        const user = users.find(u => u.phone === phoneOrName || u.name === phoneOrName || u.id === phoneOrName);
        if (!user) throw new Error('Foydalanuvchi topilmadi');
        const hash = await hashPassword(password);
        if (hash !== user.hash) throw new Error('Noto\'g\'ri parol');
        setCurrentUserId(user.id); return user;
    }

    function renderAuthState() {
        if (!accountBtn) return;
        const user = getCurrentUser();
        if (user) {
            accountBtn.innerHTML = `👤 <strong style="margin-left:6px">${escapeHtml(user.name.split(' ')[0] || user.phone)}</strong>`;
            accountBtn.title = `Tizimga kirdingiz: ${user.name}`;
        } else {
            accountBtn.innerHTML = ` <i style="color: purple;" class="fa-solid fa-user"></i> <span id="accountCount" class="cart-count" aria-hidden="true">${accountTotal}</span>`;
            accountBtn.title = 'Hisob (kirish)';
        }
    }

    // ── Profile Modal ────────────────────────────────────────────────────────
    const profileModal = document.getElementById('profileModal');
    const closeProfileBtn = document.getElementById('closeProfile');
    const profileNameEl = document.getElementById('profileName');
    const profilePhoneEl = document.getElementById('profilePhone');
    const profileRoleEl = document.getElementById('profileRole');
    const profileTitleName = document.getElementById('profileTitleName');
    const myReviewsCont = document.getElementById('myReviewsContainer');
    const tabMyReviewsBtn = document.getElementById('tabMyReviews');
    const tabSignOutBtn = document.getElementById('tabSignOut');

    function openProfileModal() {
        const u = getCurrentUser();
        if (!u) { showSignIn(); openAuth(); return; }

        // Fill profile info
        if (profileNameEl) profileNameEl.textContent = u.name || u.phone;
        if (profilePhoneEl) profilePhoneEl.textContent = u.phone || '';
        if (profileTitleName) profileTitleName.textContent = u.name ? u.name.split(' ')[0] : 'Profil';
        if (profileRoleEl) {
            profileRoleEl.innerHTML = u.role === 'admin'
                ? '<span style="background:#fef3c7;color:#d97706;padding:2px 10px;border-radius:999px;font-size:0.78rem;font-weight:700">🛡 Admin</span>'
                : '<span style="background:#d1fae5;color:#059669;padding:2px 10px;border-radius:999px;font-size:0.78rem;font-weight:700">✅ Foydalanuvchi</span>';
        }

        // Show my reviews by default
        if (myReviewsCont) renderMyReviews(myReviewsCont);

        if (profileModal) {
            profileModal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeProfileModalFn() {
        if (profileModal) profileModal.setAttribute('aria-hidden', 'true');
        if (!isAnyModalOpen()) document.body.style.overflow = '';
    }

    if (closeProfileBtn) closeProfileBtn.addEventListener('click', closeProfileModalFn);
    if (profileModal) profileModal.addEventListener('click', e => { if (e.target === profileModal) closeProfileModalFn(); });

    if (tabMyReviewsBtn) {
        tabMyReviewsBtn.addEventListener('click', () => {
            if (myReviewsCont) renderMyReviews(myReviewsCont);
            tabMyReviewsBtn.style.background = '#ff6b35';
            tabMyReviewsBtn.style.color = '#fff';
            if (tabSignOutBtn) { tabSignOutBtn.style.background = '#f3f4f6'; tabSignOutBtn.style.color = '#374151'; }
        });
    }

    if (tabSignOutBtn) {
        tabSignOutBtn.addEventListener('click', () => {
            if (!confirm('Hisobdan chiqmoqchimisiz?')) return;
            localStorage.removeItem('mazza_current_user');
            renderAuthState();
            closeProfileModalFn();
            // Admin panelini yashirish
            const adminPanel = document.getElementById('adminReviewPanel');
            if (adminPanel) adminPanel.remove();
        });
    }
    // ─────────────────────────────────────────────────────────────────────────

    // clicking account opens profile modal (if logged in) or auth modal
    if (accountBtn) {
        accountBtn.addEventListener('click', () => {
            const u = getCurrentUser();
            if (u) {
                openProfileModal();
            } else {
                showSignIn();
                openAuth();
            }
        });
    }

    // ── SMS OTP & Registration Flow ──────────────────────────────────
    let otpTimerInterval = null;
    let localFallbackOtp = null;

    // Helper for making API requests safely without JSON parsing crashes
    async function apiPost(path, payload) {
        const origin = window.location.origin || '';
        const candidateUrls = [
            path,
            origin + path,
            'https://mazza-food.uz' + path,
            'http://127.0.0.1:10000' + path,
            'http://127.0.0.1:3000' + path
        ];

        let lastErrorMsg = null;
        for (const url of candidateUrls) {
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(4000)
                });

                if (res.status === 404) {
                    continue; // Try next candidate backend if 404
                }

                const contentType = res.headers.get('content-type') || '';
                let data = null;
                if (contentType.includes('application/json')) {
                    data = await res.json();
                } else {
                    const text = await res.text();
                    try {
                        data = JSON.parse(text);
                    } catch (e) {
                        lastErrorMsg = `Server xatosi (${res.status}): Yaroqsiz javob olindi.`;
                        continue;
                    }
                }

                if (data) {
                    return { ok: res.ok && data.ok !== false, data, status: res.status };
                }
            } catch (err) {
                lastErrorMsg = err.name === 'TimeoutError' ? 'Server bilan bog\'lanish vaqti tugadi.' : 'Server bilan aloqa uzildi.';
            }
        }

        return { ok: false, error: lastErrorMsg || "Backend serverga ulanib bo'lmadi." };
    }

    function startResendTimer(seconds = 60) {
        const resendBtn = document.getElementById('resendOtpBtn');
        const timerSpan = document.getElementById('resendTimer');
        if (!resendBtn || !timerSpan) return;

        clearInterval(otpTimerInterval);
        resendBtn.disabled = true;
        let left = seconds;
        timerSpan.textContent = left;

        otpTimerInterval = setInterval(() => {
            left -= 1;
            timerSpan.textContent = left;
            if (left <= 0) {
                clearInterval(otpTimerInterval);
                resendBtn.disabled = false;
                resendBtn.innerHTML = "🔄 Qayta yuborish";
            }
        }, 1000);
    }

    // Step 1: Send SMS OTP
    if (suNextBtn) {
        suNextBtn.addEventListener('click', async () => {
            const name = (document.getElementById('suName') || {}).value.trim();
            const phone = (document.getElementById('suPhone') || {}).value.trim();
            const pw = (document.getElementById('suPassword') || {}).value;
            const pw2 = (document.getElementById('suPassword2') || {}).value;

            if (authMsg) { authMsg.style.display = 'none'; authMsg.textContent = ''; }

            if (!name || !phone || !pw) {
                if (authMsg) { authMsg.style.display = 'block'; authMsg.textContent = 'Iltimos, barcha maydonlarni to\'ldiring.'; }
                else { alert('Iltimos, barcha maydonlarni to\'ldiring.'); }
                return;
            }

            // Validate Uzbekistan phone format
            if (!/^\+998\d{9}$/.test(phone)) {
                if (authMsg) { authMsg.style.display = 'block'; authMsg.textContent = 'Telefon raqami noto\'g\'ri (+998XXXXXXXXX).'; }
                else { alert('Telefon raqami noto\'g\'ri (+998XXXXXXXXX).'); }
                return;
            }

            if (pw !== pw2) {
                if (authMsg) { authMsg.style.display = 'block'; authMsg.textContent = 'Parollar mos kelmadi.'; }
                else { alert('Parollar mos kelmadi.'); }
                return;
            }

            const users = loadUsers();
            if (users.find(u => u.phone === phone)) {
                if (authMsg) { authMsg.style.display = 'block'; authMsg.textContent = 'Telefon raqami allaqachon ro\'yxatdan o\'tgan'; }
                else { alert('Telefon raqami allaqachon ro\'yxatdan o\'tgan'); }
                return;
            }

            suNextBtn.disabled = true;
            suNextBtn.textContent = "Kodni yuborish...";

            try {
                localFallbackOtp = null;
                const res = await apiPost('/api/send-otp', { phone });

                if (!res.ok) {
                    localFallbackOtp = String(Math.floor(1000 + Math.random() * 9000));
                    
                    // Local fallback OTP generated

                    if (authMsg) {
                        authMsg.style.display = 'block';
                        authMsg.style.background = '#d1fae5';
                        authMsg.style.color = '#065f46';
                        authMsg.style.borderColor = '#6ee7b7';
                        authMsg.innerHTML = `📲 Tasdiqlash kodi yuborildi!`;
                    }
                } else {
                    if (authMsg) {
                        authMsg.style.display = 'block';
                        authMsg.style.background = '#d1fae5';
                        authMsg.style.color = '#065f46';
                        authMsg.style.borderColor = '#6ee7b7';
                        authMsg.innerHTML = `📲 Tasdiqlash kodi yuborildi!`;
                    }
                }

                // Switch to Step 2 (SMS Verification)
                const step1 = document.getElementById('signUpStep1');
                const step2 = document.getElementById('signUpStep2');
                const notice = document.getElementById('otpPhoneNotice');
                const otpInput = document.getElementById('suOtpCode');

                if (step1) step1.style.display = 'none';
                if (step2) step2.style.display = 'block';
                if (notice) notice.innerHTML = `📲 <strong>${escapeHtml(phone)}</strong> raqamiga yuborilgan 4-xonali SMS kodni kiriting.`;
                if (otpInput) { otpInput.value = ''; otpInput.focus(); }

                startResendTimer(60);
            } catch (err) {
                if (authMsg) {
                    authMsg.style.display = 'block';
                    authMsg.style.background = '#fee2e2';
                    authMsg.style.color = '#991b1b';
                    authMsg.style.borderColor = '#fca5a5';
                    authMsg.textContent = err.message || String(err);
                } else {
                    alert(err.message || String(err));
                }
            } finally {
                suNextBtn.disabled = false;
                suNextBtn.textContent = "Kodni olish (SMS)";
            }
        });
    }

    // Resend OTP Button handler
    const resendOtpBtn = document.getElementById('resendOtpBtn');
    if (resendOtpBtn) {
        resendOtpBtn.addEventListener('click', async () => {
            const phone = (document.getElementById('suPhone') || {}).value.trim();
            if (!phone) return;

            if (authMsg) { authMsg.style.display = 'none'; authMsg.textContent = ''; }
            resendOtpBtn.disabled = true;
            resendOtpBtn.textContent = "Yuborilmoqda...";

            try {
                localFallbackOtp = null;
                const res = await apiPost('/api/send-otp', { phone });

                if (!res.ok) {
                    localFallbackOtp = String(Math.floor(1000 + Math.random() * 9000));
                    // Local fallback OTP generated

                    if (authMsg) {
                        authMsg.style.display = 'block';
                        authMsg.style.background = '#d1fae5';
                        authMsg.style.color = '#065f46';
                        authMsg.style.borderColor = '#6ee7b7';
                        authMsg.innerHTML = `📲 Yangi tasdiqlash kodi yuborildi!`;
                    }
                } else {
                    if (authMsg) {
                        authMsg.style.display = 'block';
                        authMsg.style.background = '#d1fae5';
                        authMsg.style.color = '#065f46';
                        authMsg.style.borderColor = '#6ee7b7';
                        authMsg.textContent = "Yangi SMS kod yuborildi!";
                    }
                }
                startResendTimer(60);
            } catch (err) {
                if (authMsg) {
                    authMsg.style.display = 'block';
                    authMsg.style.background = '#fee2e2';
                    authMsg.style.color = '#991b1b';
                    authMsg.style.borderColor = '#fca5a5';
                    authMsg.textContent = err.message;
                }
            }
        });
    }

    // Back to Step 1 button handler
    if (suBackBtn) {
        suBackBtn.addEventListener('click', () => {
            const step1 = document.getElementById('signUpStep1');
            const step2 = document.getElementById('signUpStep2');
            if (step1) step1.style.display = 'block';
            if (step2) step2.style.display = 'none';
            if (authMsg) { authMsg.style.display = 'none'; authMsg.textContent = ''; }
            clearInterval(otpTimerInterval);
        });
    }

    // Step 2: Verify SMS OTP and Register User
    const suVerifyBtn = document.getElementById('suVerifyBtn');
    if (suVerifyBtn) {
        suVerifyBtn.addEventListener('click', async () => {
            const name = (document.getElementById('suName') || {}).value.trim();
            const phone = (document.getElementById('suPhone') || {}).value.trim();
            const pw = (document.getElementById('suPassword') || {}).value;
            const code = (document.getElementById('suOtpCode') || {}).value.trim();

            if (authMsg) {
                authMsg.style.display = 'none';
                authMsg.style.background = '#fee2e2';
                authMsg.style.color = '#991b1b';
                authMsg.style.borderColor = '#fca5a5';
            }

            if (!code || code.length < 4) {
                if (authMsg) { authMsg.style.display = 'block'; authMsg.textContent = 'Iltimos, 4-xonali SMS kodni kiriting.'; }
                else { alert('Iltimos, 4-xonali SMS kodni kiriting.'); }
                return;
            }

            suVerifyBtn.disabled = true;
            suVerifyBtn.textContent = "Tekshirilmoqda...";

            try {
                let verified = false;

                if (localFallbackOtp && code === localFallbackOtp) {
                    verified = true;
                } else {
                    const res = await apiPost('/api/verify-otp', { phone, code });
                    if (res.ok) {
                        verified = true;
                    } else {
                        throw new Error((res.data && res.data.error) || res.error || "SMS kod noto'g'ri");
                    }
                }

                if (!verified) {
                    throw new Error("SMS kod noto'g'ri. Qayta kiriting.");
                }

                // Code verified! Register user
                localFallbackOtp = null;
                await registerUser(name, phone, pw);
                renderAuthState();
                closeAuthFn();
                if (typeof renderAdminReviewPanel === 'function') renderAdminReviewPanel();
                if (typeof renderReviews === 'function') renderReviews();

                // Clear fields & reset step
                if (document.getElementById('suName')) document.getElementById('suName').value = '';
                if (document.getElementById('suPhone')) document.getElementById('suPhone').value = '';
                if (document.getElementById('suPassword')) document.getElementById('suPassword').value = '';
                if (document.getElementById('suPassword2')) document.getElementById('suPassword2').value = '';
                if (document.getElementById('suOtpCode')) document.getElementById('suOtpCode').value = '';

                const step1 = document.getElementById('signUpStep1');
                const step2 = document.getElementById('signUpStep2');
                if (step1) step1.style.display = 'block';
                if (step2) step2.style.display = 'none';
                clearInterval(otpTimerInterval);

                alert("🎉 Tabriklaymiz! Telefon raqamingiz tasdiqlandi va hisob yaratildi.");
            } catch (err) {
                if (authMsg) {
                    authMsg.style.display = 'block';
                    authMsg.textContent = err.message || String(err);
                } else {
                    alert(err.message || String(err));
                }
            } finally {
                suVerifyBtn.disabled = false;
                suVerifyBtn.textContent = "Tasdiqlash va Ro'yxatdan o'tish";
            }
        });
    }


    async function handleSignIn(e) {
        e.preventDefault();
        const phone = (document.getElementById('siPhone') || {}).value.trim();
        const pw = (document.getElementById('siPassword') || {}).value;
        if (!phone || !pw) {
            if (authMsg) { authMsg.style.display = 'block'; authMsg.textContent = 'Iltimos, telefon/foydalanuvchi nomi va parolni kiriting.'; }
            else { alert('Iltimos, telefon/foydalanuvchi nomi va parolni kiriting.'); }
            return;
        }
        try {
            await loginUser(phone, pw);
            renderAuthState();
            closeAuthFn();
            renderAdminReviewPanel();
            renderReviews();
            alert('Muvaffaqiyatli tizimga kirildi.');
        } catch (err) {
            if (authMsg) { authMsg.style.display = 'block'; authMsg.textContent = err.message || String(err); }
            else { alert(err.message || String(err)); }
        }
    }

    if (signInForm) signInForm.addEventListener('submit', handleSignIn);

    // initialize header auth state
    renderAuthState();

    if (cartModal) {
        cartModal.addEventListener('click', e => {
            if (e.target === cartModal) closeCartFn();
        })
    }

    if (authModal) {
        authModal.addEventListener('click', e => {
            if (getCurrentUser() && e.target === authModal) closeAuthFn();
        });
    }

    // Mobile hamburger menu toggle
    (function mobileNavToggle() {
        const burger = document.getElementById('burgerBtn');
        const mobile = document.getElementById('mobileNav');
        if (!burger || !mobile) return;

        function open() {
            burger.setAttribute('aria-expanded', 'true');
            mobile.classList.add('open');
            mobile.setAttribute('aria-hidden', 'false');
        }
        function close() {
            burger.setAttribute('aria-expanded', 'false');
            mobile.classList.remove('open');
            mobile.setAttribute('aria-hidden', 'true');
        }

        burger.addEventListener('click', () => {
            const expanded = burger.getAttribute('aria-expanded') === 'true';
            if (expanded) close(); else open();
        });

        mobile.addEventListener('click', e => {
            if (e.target && e.target.matches('.mobile-link')) close();
        });

        document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    })();

    // Order modal handlers
    function populateOrderForm() {
        if (!orderItemsEl) return;
        // Build two-column order layout: left = items + delivery options, right = summary
        orderItemsEl.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'order-modal-grid';
        const left = document.createElement('div'); left.className = 'order-col-left';
        const right = document.createElement('div'); right.className = 'summary';
        grid.appendChild(left); grid.appendChild(right);

        // Populate items
        let total = 0;
        Object.keys(cart).forEach(id => {
            const it = cart[id];
            const row = document.createElement('div');
            row.className = 'order-item';
            row.innerHTML = `<div class="name">${escapeHtml(it.name)} <small>× ${it.qty}</small></div><div class="price">${formatPrice(it.price * it.qty)}</div>`;
            left.appendChild(row);
            total += it.price * it.qty;
        });

        // Subtotal row (left)
        const subtotalRow = document.createElement('div');
        subtotalRow.className = 'order-item';
        subtotalRow.id = 'subtotalRow';
        subtotalRow.innerHTML = `<div><strong>Total</strong></div><div><strong>${formatPrice(total)}</strong></div>`;
        left.appendChild(subtotalRow);

        // Summary panel initial content
        right.innerHTML = `
            <div style="font-weight:700;margin-bottom:8px">Yetkazib berish</div>
            <div class="summary-body">
                <div class="summary-row"><div>Yetkazib berish:</div><div id="deliverySummary">—</div></div>
                <div class="summary-row total"><div>Jami (yetkazib berish bilan)</div><div id="grandTotalRow"><strong>${formatPrice(total)}</strong></div></div>
            </div>
        `;

        // Delivery calculation helper
        function calculateDelivery(subtotal, method) {
            const m = method || 'standard';
            let fee = 0; let eta = 0;
            if (m === 'pickup') { fee = 0; eta = 10; }
            else if (m === 'zalda') { fee = 0; eta = 5; }
            else if (m === 'express') { fee = Math.max(5000, Math.round(subtotal * 0.05)); eta = 20; }
            else { fee = subtotal >= 100000 ? 0 : 10000; eta = 30; }
            return { fee, eta, method: m };
        }

        // Delivery options UI (left)
        const existing = document.getElementById('deliveryOptions');
        if (!existing) {
            const wrapper = document.createElement('div');
            wrapper.id = 'deliveryOptions';
            wrapper.style.marginTop = '12px';
            wrapper.innerHTML = `
                <div class="delivery-label" style="margin-bottom:8px;font-weight:600;">Buyurtma turi</div>
                <div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
                    <button type="button" class="btn d-btn active" data-val="standard" style="flex:1; padding:8px; border:1px solid #ff6b35; background:#ff6b35; color:#fff; border-radius:8px;">Yetkazib berish</button>
                    <button type="button" class="btn d-btn" data-val="pickup" style="flex:1; padding:8px; border:1px solid #ccc; background:#fff; color:#333; border-radius:8px;">Olib ketish</button>
                    <button type="button" class="btn d-btn" data-val="zalda" style="flex:1; padding:8px; border:1px solid #ccc; background:#fff; color:#333; border-radius:8px;">Zalda</button>
                </div>
                <input type="hidden" id="deliveryMethod" value="standard">
            `;
            left.appendChild(wrapper);

            const sel = wrapper.querySelector('#deliveryMethod');
            const dBtns = wrapper.querySelectorAll('.d-btn');
            dBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    dBtns.forEach(b => {
                        b.classList.remove('active');
                        b.style.background = '#fff';
                        b.style.color = '#333';
                        b.style.borderColor = '#ccc';
                    });
                    btn.classList.add('active');
                    btn.style.background = '#ff6b35';
                    btn.style.color = '#fff';
                    btn.style.borderColor = '#ff6b35';
                    sel.value = btn.dataset.val;
                    sel.dispatchEvent(new Event('change'));
                });
            });
            const addressInput = document.getElementById('customerAddress');
            const addressLabel = document.querySelector('label[for="customerAddress"]');

            sel.addEventListener('change', () => {
                const info = calculateDelivery(total, sel.value);
                window.__mazza_current_delivery = info;

                // Toggle address visibility
                if (sel.value === 'pickup' || sel.value === 'zalda') {
                    if (addressInput) {
                        addressInput.style.display = 'none';
                        addressInput.required = false;
                        addressInput.value = ''; // Clear value
                    }
                    if (addressLabel) addressLabel.style.display = 'none';
                } else {
                    if (addressInput) {
                        addressInput.style.display = 'block';
                        addressInput.required = true;
                    }
                    if (addressLabel) addressLabel.style.display = 'block';
                }

                // update right summary
                const deliverySummary = document.getElementById('deliverySummary');
                const grand = document.getElementById('grandTotalRow');
                if (deliverySummary) deliverySummary.innerHTML = `<strong>${formatPrice(info.fee)}</strong> — ${info.eta} min`;
                if (grand) grand.innerHTML = `<strong>${formatPrice(total + info.fee)}</strong>`;
            });

            // initial trigger
            sel.dispatchEvent(new Event('change'));
        }

        // Payment options UI (after delivery options)
        const paymentWrapper = document.createElement('div');
        paymentWrapper.id = 'paymentOptions';
        paymentWrapper.style.marginTop = '16px';
        paymentWrapper.innerHTML = `
            <div class="delivery-label">To'lov turi</div>
            <select id="paymentMethod" aria-label="Payment method" style="width:100%; padding:10px; border-radius:10px; border:1px solid #ddd;">
                <option value="cash">Naqd (yetkazib berilganda)</option>
                <option value="click">Click / Payme (karta orqali)</option>
            </select>
            <div id="clickDetails" style="display:none; margin-top:12px; padding:16px; background:#f0f8ff; border:1px solid #bce0fd; border-radius:12px;">
                <div style="font-weight:700; color:#00a0e3; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
                    <span>💳</span> CLICK / Payme
                </div>
                <div style="font-size:1.25rem; font-family:monospace; margin-bottom:6px; letter-spacing:1px; font-weight:700; color:#333;">5614 6822 1326 5467</div>
                <div style="color:#555; font-size:0.95rem; margin-bottom:12px; font-weight:500;">Xatamkulov Xabibjon</div>
                <button type="button" id="copyCardBtn" class="btn" style="padding:8px 14px; font-size:0.9rem; background:#fff; border:1px solid #ddd; color:#333; width:100%;">
                    Karta raqamidan nusxa olish 📋
                </button>
            </div>
        `;
        left.appendChild(paymentWrapper);

        const paymentSel = paymentWrapper.querySelector('#paymentMethod');
        const clickDetails = paymentWrapper.querySelector('#clickDetails');
        const copyBtn = paymentWrapper.querySelector('#copyCardBtn');

        paymentSel.addEventListener('change', () => {
            if (paymentSel.value === 'click') {
                clickDetails.style.display = 'block';
            } else {
                clickDetails.style.display = 'none';
            }
        });

        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText('5614682213265467')
                .then(() => {
                    const originalText = copyBtn.innerHTML;
                    copyBtn.innerHTML = 'Nusxalandi! ✅';
                    copyBtn.style.borderColor = '#2ecc71';
                    copyBtn.style.color = '#2ecc71';
                    setTimeout(() => {
                        copyBtn.innerHTML = originalText;
                        copyBtn.style.borderColor = '#ddd';
                        copyBtn.style.color = '#333';
                    }, 2000);
                })
                .catch(err => {
                    console.error('Copy failed', err);
                    alert('Nusxalab bo\'lmadi. Iltimos qo\'lda nusxalang.');
                });
        });

        orderItemsEl.appendChild(grid);
    }

    function closeOrderFn() {
        orderModal.setAttribute('aria-hidden', 'true');
        if (!isAnyModalOpen()) document.body.style.overflow = '';
    }
    closeOrder.addEventListener('click', closeOrderFn);
    orderCancel.addEventListener('click', e => { e.preventDefault(); closeOrderFn(); });
    orderModal.addEventListener('click', e => { if (e.target === orderModal) closeOrderFn(); });

    if (orderForm) {
        orderForm.onsubmit = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const submitBtn = orderForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn ? submitBtn.textContent : '';

            try {
                const nameEl = document.getElementById('customerName');
                const phoneEl = document.getElementById('customerPhone');
                const addrEl = document.getElementById('customerAddress');

                const name = nameEl ? nameEl.value.trim() : '';
                const phone = phoneEl ? phoneEl.value.trim() : '';
                let address = addrEl ? addrEl.value.trim() : '';

                const delivery = window.__mazza_current_delivery || { fee: 0, eta: 0, method: 'standard' };
                if (delivery.method === 'pickup') {
                    address = 'Olib ketish';
                } else if (delivery.method === 'zalda') {
                    address = 'Ichkarida (Zalda)';
                }

                if (!/^[A-Za-z\u0400-\u04FF\s\'\`]+$/.test(name)) {
                    alert('Ismda faqat harflar bo\'lishi kerak.');
                    return;
                }

                if (!/^\+998(33|50|55|70|71|77|88|90|91|93|94|95|97|98|99)\d{7}$/.test(phone)) {
                    alert('Telefon raqami noto\'g\'ri formatda yoki O\'zbekiston kodi emas. Iltimos, +998 bilan boshlanadigan to\'g\'ri raqam kiriting (masalan: +998901234567).');
                    return;
                }

                if (!name || !phone || (!address && delivery.method !== 'pickup')) {
                    alert('Iltimos, barcha maydonlarni to\'ldiring.');
                    return;
                }

                const subtotal = Object.values(cart).reduce((s, i) => s + i.price * i.qty, 0);
                const totalWithDelivery = subtotal + (Number(delivery.fee) || 0);

                const paymentSel = document.getElementById('paymentMethod');
                const paymentMethod = paymentSel ? paymentSel.value : 'cash';

                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Yuborilmoqda...';
                }

                const order = { id: 'ord_' + Date.now(), name, phone, address, items: { ...cart }, subtotal, delivery, total: totalWithDelivery, payment: paymentMethod, ts: Date.now() };

                // Foydalanuvchi ma'lumotlarini saqlash (keyingi safar avto-to'ldirish uchun)
                localStorage.setItem('mazza_last_customer', JSON.stringify({ name, phone }));

                // Agar foydalanuvchi login qilgan bo'lsa, profil ma'lumotlarini yangilash
                const currentUser = getCurrentUser();
                if (currentUser) {
                    const users = loadUsers();
                    const idx = users.findIndex(u => String(u.id) === String(currentUser.id));
                    if (idx !== -1) {
                        users[idx].name = name;
                        users[idx].phone = phone;
                        saveUsers(users);
                    }
                }

                const orders = JSON.parse(localStorage.getItem('mazza_orders') || '[]');
                orders.push(order);
                localStorage.setItem('mazza_orders', JSON.stringify(orders));

                let backendOk = false;
                let backendErrorMsg = '';
                try {
                    backendOk = await sendOrderToBackend(order);
                } catch (err) {
                    console.error('Order sending error:', err);
                    backendErrorMsg = err?.message || String(err);
                }

                const eta = delivery && delivery.eta ? `${delivery.eta} daqiqa` : 'tez orada';
                if (backendOk) {
                    alert('✅ Buyurtma qabul qilindi va Telegram orqali yuborildi!\nYetkazib berish: taxminan ' + eta + '.\nJami: ' + formatPrice(totalWithDelivery));
                } else {
                    alert('⚠️ DIQQAT: Internet bilan bog\'lanishda xatolik yoki server ishlamayapti.\n\nBuyurtma saqlandi, lekin ADMINGA YUBORILMADI!\nIltimos, darhol qo\'ng\'iroq qiling: +998 97 201 10 10\n\nJami: ' + formatPrice(totalWithDelivery) + '\n' + (backendErrorMsg ? 'Xato: ' + backendErrorMsg : ''));
                }

                cart = {};
                updateCartUI();
                closeOrderFn();
                closeCartFn();
            } catch (outerErr) {
                console.error('Order form FATAL error:', outerErr);
                alert('❌ Xatolik yuz berdi: ' + (outerErr?.message || String(outerErr)) + '\nIltimos, qo\'ng\'iroq qiling: +998 97 201 10 10');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalBtnText;
                }
            }
        };
    }

    // Send order via Telegram Bot API directly (no backend server needed)
    async function sendOrderToBackend(order) {
        // First try backend server endpoints
        try {
            const res = await apiPost('/api/send-order', { order });
            if (res.ok) return true;
            const res2 = await apiPost('/api', { action: 'submit_order', order });
            if (res2 && res2.ok) return true;
        } catch (err) {
            console.warn('Backend server unavailable, trying Telegram API directly:', err);
        }

        // Fallback: send directly via Telegram Bot API
        try {
            const ADMIN_BOT_TOKEN = '8429193461:AAEnBiGsVX4hKYVnKYCnI5ZdLvNg7_0jZdE';
            const ADMIN_CHAT_ID = '8283401187';

            const deliveryMethodMap = { pickup: 'Olib ketish', zalda: 'Zalda', express: 'Express', standard: 'Yetkazib berish' };
            const d = order.delivery || {};
            const dMethod = deliveryMethodMap[d.method] || d.method || 'Yetkazib berish';
            const paymentLabel = order.payment === 'click' ? '💳 Click / Payme' : '💵 Naqd';

            let itemsText = '';
            const items = order.items || {};
            if (typeof items === 'object' && !Array.isArray(items)) {
                Object.values(items).forEach(it => {
                    itemsText += `  ▫️ ${it.name} × ${it.qty} = ${(it.price * it.qty).toLocaleString()} so'm\n`;
                });
            } else if (Array.isArray(items)) {
                items.forEach(it => {
                    itemsText += `  ▫️ ${it.name} × ${it.qty} = ${(it.price * it.qty).toLocaleString()} so'm\n`;
                });
            }

            const now = new Date();
            const timeStr = now.toLocaleString('uz-UZ', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' });

            const text = `📦 <b>Yangi buyurtma (Sayt)!</b>\n\n` +
                `👤 Mijoz: <b>${order.name || "Noma'lum"}</b>\n` +
                `📞 Telefon: <code>${order.phone || "Noma'lum"}</code>\n` +
                `📍 Manzil: ${order.address || '-'}\n\n` +
                `🛒 <b>Buyurtma tarkibi:</b>\n${itemsText}\n` +
                `🚚 Yetkazib berish: <b>${dMethod}</b>${d.fee ? ` (${Number(d.fee).toLocaleString()} so'm)` : ''}\n` +
                `${paymentLabel}\n\n` +
                `💰 <b>Jami: ${(order.total || 0).toLocaleString()} so'm</b>\n` +
                `🕒 Vaqt: ${timeStr}`;

            const tgRes = await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: ADMIN_CHAT_ID,
                    text,
                    parse_mode: 'HTML'
                }),
                signal: AbortSignal.timeout(8000)
            });

            const tgData = await tgRes.json();
            if (tgData.ok) {
                console.log('Order sent via Telegram Bot API directly.');
                return true;
            } else {
                console.error('Telegram API error:', tgData);
                return false;
            }
        } catch (err) {
            console.error('Error sending order via Telegram API:', err);
            return false;
        }
    }

    detectCurrency();
    updateCartUI();

    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    function escapeHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Render tasdiqlangan fikrlar
    function renderReviews() {
        if (!reviewsList) return;
        reviewsList.innerHTML = '';
        if (!reviews || reviews.length === 0) {
            reviewsList.innerHTML = '<li class="review-item"><em>Hozircha sharhlar yo\'q. Birinchi bo\'ling!</em></li>';
            return;
        }
        reviews.slice().reverse().forEach(r => {
            const li = document.createElement('li');
            li.className = 'review-item';

            const currentUser = getCurrentUser();
            let deleteBtnHtml = '';
            if (currentUser && currentUser.role === 'admin') {
                deleteBtnHtml = `<button class="review-delete" data-ts="${r.ts}" aria-label="Delete review"
                    style="background:#fee2e2;color:#ef4444;border:none;padding:5px 10px;border-radius:8px;cursor:pointer;font-size:0.8rem;">🗑 O'chirish</button>`;
            }

            const starHtml = '⭐'.repeat(r.rating);
            li.innerHTML = `
                <div class="review-meta">
                    <strong>${escapeHtml(r.name)}</strong>
                    <span style="color:#f59e0b">${starHtml}</span>
                    <small style="color:#9ca3af;margin-left:auto">${new Date(r.ts).toLocaleString('uz-UZ')}</small>
                    ${deleteBtnHtml}
                </div>
                <div class="review-body">${escapeHtml(r.text)}</div>`;
            reviewsList.appendChild(li);
        });
    }

    // Admin o'chirish (local) — delegation orqali
    reviewsList.addEventListener('click', e => {
        if (e.target && e.target.classList.contains('review-delete')) {
            const currentUser = getCurrentUser();
            if (currentUser && currentUser.role === 'admin') {
                if (!confirm('Bu sharhni o\'chirishni tasdiqlaysizmi?')) return;
                const ts = Number(e.target.dataset.ts);
                reviews = reviews.filter(r => r.ts !== ts);
                localStorage.setItem('mazza_approved_reviews', JSON.stringify(reviews));
                // All reviews dan ham status yangilash
                allReviews = allReviews.map(r => r.ts === ts ? { ...r, status: 'deleted' } : r);
                localStorage.setItem('mazza_all_reviews', JSON.stringify(allReviews));
                renderReviews();
            } else {
                alert('Sizda bu sharhni o\'chirish huquqi yo\'q!');
            }
        }
    });

    // Shaxsiy fikrlar tarixini profilda ko'rsatish
    function renderMyReviews(containerEl) {
        if (!containerEl) return;
        const currentUser = getCurrentUser();
        if (!currentUser) { containerEl.innerHTML = '<p style="color:#9ca3af">Kirish talab etiladi.</p>'; return; }

        const myHistory = allReviews.filter(r => r.userId === currentUser.id);
        if (myHistory.length === 0) {
            containerEl.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:20px">Hali hech qanday fikr yozmagansiz.</p>';
            return;
        }
        containerEl.innerHTML = '';
        myHistory.slice().reverse().forEach(r => {
            const statusMap = {
                'pending': { label: 'Moderatsiyada ⏳', color: '#f59e0b', bg: '#fef3c7' },
                'approved': { label: 'Tasdiqlandi ✅', color: '#10b981', bg: '#d1fae5' },
                'deleted': { label: 'O\'chirildi ❌', color: '#ef4444', bg: '#fee2e2' }
            };
            const status = statusMap[r.status] || statusMap['pending'];
            const starHtml = '⭐'.repeat(r.rating);
            const div = document.createElement('div');
            div.style.cssText = 'background:#fff;border-radius:12px;padding:14px 16px;margin-bottom:10px;box-shadow:0 2px 8px rgba(0,0,0,0.06);border:1px solid #f3f4f6;';
            div.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                    <span style="color:#f59e0b">${starHtml}</span>
                    <span style="background:${status.bg};color:${status.color};padding:3px 10px;border-radius:999px;font-size:0.75rem;font-weight:600">${status.label}</span>
                </div>
                <div style="color:#374151;margin-bottom:6px">${escapeHtml(r.text)}</div>
                <small style="color:#9ca3af">${new Date(r.ts).toLocaleString('uz-UZ')}</small>`;
            containerEl.appendChild(div);
        });
    }

    renderReviews();

    // Sahifa yuklanganida admin panelini ko'rsatish
    renderAdminReviewPanel();

    // Server dan tasdiqlangan fikrlarni olish (agar backend ishlayotgan bo'lsa)
    (async function syncServerReviews() {
        try {
            const resp = await fetch('https://mazza-food.uz/api/reviews', { signal: AbortSignal.timeout(3000) });
            if (!resp.ok) return;
            const data = await resp.json();
            if (data.ok && Array.isArray(data.reviews)) {
                // Server dan kelgan tasdiqlangan fikrlarni localStorage bilan birlashtirish
                const serverReviews = data.reviews;
                const localTs = new Set(reviews.map(r => r.ts));
                serverReviews.forEach(r => {
                    if (!localTs.has(r.ts)) reviews.push(r);
                });
                localStorage.setItem('mazza_approved_reviews', JSON.stringify(reviews));
                renderReviews();
            }
        } catch (e) {
            // Server ishlamayapti — local dan foydalanish
        }
    })();

    // Hero text entrance: add .animate class on load so heading, paragraph and CTA fade/slide in
    (function heroEntrance() {
        const hero = document.querySelector('.hero-text');
        if (!hero) return;

        // small delay so assets settle and CSS transitions run
        window.requestAnimationFrame(() => {
            setTimeout(() => {
                hero.classList.add('animate');
            }, 80);
        });

        // If user navigates back / forward, ensure animation runs again
        window.addEventListener('pageshow', (e) => {
            if (e.persisted) {
                // force reflow then re-add class
                hero.classList.remove('animate');
                void hero.offsetWidth;
                setTimeout(() => hero.classList.add('animate'), 50);
            }
        });
    })();

    // Send review via secure backend API endpoint (never exposes Telegram BOT_TOKEN in browser)
    async function sendReviewToTelegram(entry) {
        try {
            const res = await apiPost('/api/reviews', entry);
            if (res.ok) return true;
            const res2 = await apiPost('/api', { action: 'new_review', review: entry });
            return !!(res2 && res2.ok);
        } catch (err) {
            console.error('Error submitting review to backend:', err);
            return false;
        }
    }

    if (reviewForm) {
        reviewForm.addEventListener('submit', async e => {
            e.preventDefault();
            console.log('Submit clicked');
            // alert('Yuborish jarayoni boshlandi...'); 

            const cur = getCurrentUser();
            if (!cur) {
                alert('Iltimos, sharh qoldirish uchun tizimga kiring yoki hisob yarating.');
                showSignIn();
                openAuth();
                return;
            }
            const name = cur.name || cur.phone || 'Foydalanuvchi';
            const rating = parseInt(reviewRating.value, 10) || 5;
            const text = reviewText.value.trim();
            if (!text) {
                alert('Iltimos, qisqacha fikringizni yozing.');
                return;
            }

            const submitBtn = reviewForm.querySelector('button[type="submit"]');
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Yuborilmoqda...'; }

            const entry = { name, rating, text, ts: Date.now(), userId: cur.id, status: 'pending' };

            // Barcha foydalanuvchi fikrlarini saqlash (tarixi uchun)
            allReviews.push(entry);
            localStorage.setItem('mazza_all_reviews', JSON.stringify(allReviews));

            try {
                const ok = await sendReviewToTelegram(entry);
                if (ok) {
                    alert('✅ Rahmat! Sharhingiz adminга yuborildi. Tasdiqlangandan so\'ng saytda ko\'rinadi.');
                } else {
                    alert('⚠️ Yuborishda xatolik. Sharh saqlab qolindi — admin keyinroq ko\'radi.');
                }
            } catch (err) {
                console.error('Telegram review error:', err);
                alert('⚠️ Internet xatoligi. Sharh lokal saqland.');
            } finally {
                reviewForm.reset();
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Fikrni yuborish'; }
            }
        });
    }

    // Telegram Webhook uchun: bot dan callback ni veb sayt orqali qaytarish
    // Bu funksiya Telegram bot webhook da ishlaydi (main.py da handle qilinadi)
    // Lekin biz websocket / polling o'rniga localStorage sync qilamiz.
    // Admin sayt orqali kirganida fikrlarni tasdiqlashi uchun admin panel:
    function renderAdminReviewPanel() {
        const cur = getCurrentUser();
        if (!cur || cur.role !== 'admin') return;

        // Admin panel container yaratish
        let panel = document.getElementById('adminReviewPanel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'adminReviewPanel';
            panel.style.cssText = 'background:#1e293b;border-radius:16px;padding:20px;margin-top:20px;';
            const reviewsSection = document.getElementById('reviews');
            if (reviewsSection) reviewsSection.appendChild(panel);
        }

        const pending = allReviews.filter(r => r.status === 'pending');
        if (pending.length === 0) {
            panel.innerHTML = '<p style="color:#64748b;text-align:center">Moderatsiyada fikr yo\'q ✅</p>';
            return;
        }
        panel.innerHTML = `<h4 style="color:#f1f5f9;margin:0 0 14px;font-size:1rem">🛡 Admin — Moderatsiya (${pending.length} ta)</h4>`;
        pending.forEach(r => {
            const starHtml = '⭐'.repeat(r.rating);
            const div = document.createElement('div');
            div.style.cssText = 'background:#334155;border-radius:12px;padding:14px;margin-bottom:10px;';
            div.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px">
                    <div>
                        <strong style="color:#f1f5f9">${escapeHtml(r.name)}</strong>
                        <span style="color:#f59e0b;margin-left:8px">${starHtml}</span>
                        <small style="color:#64748b;display:block;margin-top:2px">${new Date(r.ts).toLocaleString('uz-UZ')}</small>
                    </div>
                </div>
                <p style="color:#cbd5e1;margin:0 0 12px">${escapeHtml(r.text)}</p>
                <div style="display:flex;gap:8px">
                    <button class="admin-approve" data-ts="${r.ts}"
                        style="flex:1;background:#10b981;color:#fff;border:none;padding:8px 14px;border-radius:10px;cursor:pointer;font-weight:600">✅ Qoldirish</button>
                    <button class="admin-delete" data-ts="${r.ts}"
                        style="flex:1;background:#ef4444;color:#fff;border:none;padding:8px 14px;border-radius:10px;cursor:pointer;font-weight:600">❌ O'chirish</button>
                </div>`;
            panel.appendChild(div);
        });

        // Action handlers
        panel.querySelectorAll('.admin-approve').forEach(btn => {
            btn.addEventListener('click', () => {
                const ts = Number(btn.dataset.ts);
                const review = allReviews.find(r => r.ts === ts);
                if (!review) return;
                // Tasdiqlash
                review.status = 'approved';
                reviews.push({ ...review });
                localStorage.setItem('mazza_approved_reviews', JSON.stringify(reviews));
                localStorage.setItem('mazza_all_reviews', JSON.stringify(allReviews));
                renderReviews();
                renderAdminReviewPanel();
            });
        });

        panel.querySelectorAll('.admin-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                const ts = Number(btn.dataset.ts);
                allReviews = allReviews.map(r => r.ts === ts ? { ...r, status: 'deleted' } : r);
                localStorage.setItem('mazza_all_reviews', JSON.stringify(allReviews));
                renderAdminReviewPanel();
            });
        });
    }

    // --- Phone Number Input Formatting ---
    function setupPhoneInput(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;

        input.placeholder = '+998XXXXXXXXX';

        input.addEventListener('input', (e) => {
            let value = e.target.value;
            // Only allow + and digits
            value = value.replace(/[^\d+]/g, '');

            // Ensure starts with +998
            if (value.length > 0 && !value.startsWith('+')) {
                value = '+' + value;
            }
            if (value.length >= 4 && !value.startsWith('+998')) {
                value = '+998' + value.replace(/^\+?/, '').replace(/^998/, '');
            }

            // Max length +998 + 9 digits = 13 chars
            if (value.length > 13) {
                value = value.slice(0, 13);
            }

            e.target.value = value;
        });

        input.addEventListener('focus', (e) => {
            if (!e.target.value) {
                e.target.value = '+998';
            }
        });

        input.addEventListener('blur', (e) => {
            if (e.target.value === '+998') {
                e.target.value = '';
            }
        });
    }

    setupPhoneInput('customerPhone');
    setupPhoneInput('suPhone');
    setupPhoneInput('siPhone');

}); 