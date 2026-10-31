import { useState, useCallback, useMemo } from 'react';

/**
 * Hook to manage audit status tracking for products during market operation session
 * Tracks which products have been fully audited (all lots conferenced/sold)
 */
export function useOperacaoMercados() {
  // Map of product_id -> audit status ('complete', 'partial', 'pending')
  const [auditedProducts, setAuditedProducts] = useState(new Map());
  
  // Total products count in current market
  const [totalProducts, setTotalProducts] = useState(0);

  /**
   * Mark a product as fully audited
   * @param {string} productId - UUID of the product
   */
  const markProductAuditComplete = useCallback((productId) => {
    setAuditedProducts(prev => {
      const newMap = new Map(prev);
      newMap.set(productId, 'complete');
      return newMap;
    });
  }, []);

  /**
   * Mark a product as partially audited
   * @param {string} productId - UUID of the product
   */
  const markProductAuditPartial = useCallback((productId) => {
    setAuditedProducts(prev => {
      const newMap = new Map(prev);
      // Only update if not already complete
      if (newMap.get(productId) !== 'complete') {
        newMap.set(productId, 'partial');
      }
      return newMap;
    });
  }, []);

  /**
   * Get audit status for a specific product
   * @param {string} productId - UUID of the product
   * @returns {'complete' | 'partial' | 'pending'}
   */
  const getProductAuditStatus = useCallback((productId) => {
    return auditedProducts.get(productId) || 'pending';
  }, [auditedProducts]);

  /**
   * Get count of fully audited products
   * @returns {number}
   */
  const getAuditedProductCount = useCallback(() => {
    let count = 0;
    auditedProducts.forEach(status => {
      if (status === 'complete') count++;
    });
    return count;
  }, [auditedProducts]);

  /**
   * Get total products count
   * @returns {number}
   */
  const getTotalProductCount = useCallback(() => {
    return totalProducts;
  }, [totalProducts]);

  /**
   * Set total products count (called when products are loaded)
   * @param {number} count
   */
  const setTotalProductCount = useCallback((count) => {
    setTotalProducts(count);
  }, []);

  /**
   * Reset audit tracking (when switching markets or finalizing visit)
   */
  const resetAuditStatus = useCallback(() => {
    setAuditedProducts(new Map());
    setTotalProducts(0);
  }, []);

  /**
   * Check if any products have been audited
   * @returns {boolean}
   */
  const hasAnyAuditedProducts = useMemo(() => {
    return auditedProducts.size > 0 && getAuditedProductCount() > 0;
  }, [auditedProducts, getAuditedProductCount]);

  /**
   * Get audit progress summary
   * @returns {Object} - {audited: number, total: number, percentage: number}
   */
  const getAuditProgress = useMemo(() => {
    const audited = getAuditedProductCount();
    const total = totalProducts;
    const percentage = total > 0 ? Math.round((audited / total) * 100) : 0;
    
    return { audited, total, percentage };
  }, [getAuditedProductCount, totalProducts]);

  return {
    markProductAuditComplete,
    markProductAuditPartial,
    getProductAuditStatus,
    getAuditedProductCount,
    getTotalProductCount,
    setTotalProductCount,
    resetAuditStatus,
    hasAnyAuditedProducts,
    getAuditProgress,
  };
}