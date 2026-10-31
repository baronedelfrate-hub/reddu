export const STATIC_ESTOQUE_BANDEJAS_ID = 'ffffffff-ffff-4fff-afff-ffffffffffff';

export function withEstoqueBandejas(locaisArray) {
  if (!Array.isArray(locaisArray)) return [];
  
  const exists = locaisArray.some(l => {
    const name = l.nome || l.local_nome || '';
    return name.toUpperCase() === 'ESTOQUE BANDEJAS';
  });
  
  if (exists) return locaisArray;

  return [
    ...locaisArray,
    {
      id: STATIC_ESTOQUE_BANDEJAS_ID,
      nome: 'ESTOQUE BANDEJAS',
      tipo: 'Sistema',
      is_system: true
    }
  ];
}