/* --- STYLISH DARK SIDEBAR THEME --- */

.sb-cart-item {
    background: #1a1a1a !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
    padding: 12px 10px !important;
    transition: background 0.2s ease;
}

.sb-cart-item:hover {
    background: #222222 !important;
}

/* Image styling to match the card "Island" style */
.sb-img-frame {
    width: 52px;
    height: 52px;
    background: #242424;
    border-radius: 8px;
    padding: 4px;
    border: 1px solid rgba(255, 255, 255, 0.05);
}

.sb-img-frame img {
    width: 100%;
    height: 100%;
    object-fit: contain;
}

/* Typography */
.sb-item-title {
    color: #efefef !important;
    font-size: 0.85rem !important;
    font-weight: 500 !important;
    line-height: 1.2;
    margin-bottom: 2px;
}

.sb-item-meta {
    color: #2ecc71 !important; /* Neon Green to match sale price */
    font-size: 0.75rem !important;
    font-weight: 600;
    opacity: 0.9;
}

/* Stylish Sidebar Buttons */
.sb-btn {
    border: none !important;
    border-radius: 6px !important;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s ease;
}

.sb-btn-step {
    background: #333 !important;
    color: #fff !important;
    font-size: 1rem;
}

.sb-btn-step:hover {
    background: #444 !important;
    color: #2ecc71 !important; /* Green glow on hover */
}

.sb-btn-delete {
    background: rgba(255, 71, 87, 0.1) !important;
    color: #ff4757 !important;
    font-size: 0.75rem;
    margin-left: 5px;
}

.sb-btn-delete:hover {
    background: #ff4757 !important;
    color: white !important;
}

/* Scoped Fix for the Sidebar Container itself if it's a List Group */
#cartList {
    background: #1a1a1a !important;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.05);
}