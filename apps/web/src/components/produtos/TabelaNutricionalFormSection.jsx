import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CAMPOS_NUTRICIONAIS } from '@/utils/nutritionalTable';
import TabelaNutricionalPreview from '@/components/etiquetas/TabelaNutricionalPreview';

/**
 * Seção do formulário de Produto para cadastro da Tabela de Informação
 * Nutricional (RDC 429/2020). `formData` deve conter os campos nutricionais
 * como strings (mesmo padrão do restante do formulário de Produtos).
 */
export default function TabelaNutricionalFormSection({ formData, setFormData }) {
  const setField = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="border-t pt-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <Checkbox
          id="possui_tabela_nutricional"
          checked={formData.possui_tabela_nutricional}
          onCheckedChange={(checked) => setField('possui_tabela_nutricional', checked)}
        />
        <Label htmlFor="possui_tabela_nutricional" className="text-gray-900 font-semibold cursor-pointer">
          Este produto possui Tabela de Informação Nutricional (RDC 429/2020)
        </Label>
      </div>

      {formData.possui_tabela_nutricional && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="porcao_valor" className="text-gray-900 text-sm">Porção</Label>
                <div className="flex gap-1">
                  <Input
                    id="porcao_valor"
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="Ex: 30"
                    value={formData.porcao_valor}
                    onChange={(e) => setField('porcao_valor', e.target.value)}
                    className="bg-white text-gray-900"
                  />
                  <Select
                    value={formData.porcao_unidade || 'g'}
                    onValueChange={(val) => setField('porcao_unidade', val)}
                  >
                    <SelectTrigger className="bg-white text-gray-900 w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="g">g</SelectItem>
                      <SelectItem value="ml">ml</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="porcoes_por_embalagem" className="text-gray-900 text-sm">Porções/embalagem</Label>
                <Input
                  id="porcoes_por_embalagem"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="Opcional"
                  value={formData.porcoes_por_embalagem}
                  onChange={(e) => setField('porcoes_por_embalagem', e.target.value)}
                  className="bg-white text-gray-900"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="medida_caseira" className="text-gray-900 text-sm">Medida caseira</Label>
              <Input
                id="medida_caseira"
                placeholder='Ex: "2 colheres de sopa", "1 unidade"'
                value={formData.medida_caseira}
                onChange={(e) => setField('medida_caseira', e.target.value)}
                className="bg-white text-gray-900"
              />
            </div>

            <p className="text-xs text-gray-500 pt-1">
              Valores abaixo referem-se à <strong>porção</strong> declarada acima. O %VD é calculado automaticamente.
            </p>

            <div className="grid grid-cols-2 gap-3">
              {CAMPOS_NUTRICIONAIS.map((campo) => (
                <div className="space-y-1" key={campo.key}>
                  <Label htmlFor={campo.key} className="text-gray-900 text-xs">
                    {campo.label} ({campo.unidade})
                  </Label>
                  <Input
                    id={campo.key}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    value={formData[campo.key]}
                    onChange={(e) => setField(campo.key, e.target.value)}
                    className="bg-white text-gray-900"
                  />
                </div>
              ))}
            </div>

            <div className="space-y-1 pt-2">
              <Label htmlFor="alergenicos_contem" className="text-gray-900 text-sm">Alérgicos — CONTÉM</Label>
              <Input
                id="alergenicos_contem"
                placeholder="Ex: leite, glúten, soja"
                value={formData.alergenicos_contem}
                onChange={(e) => setField('alergenicos_contem', e.target.value)}
                className="bg-white text-gray-900"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="alergenicos_pode_conter" className="text-gray-900 text-sm">Alérgicos — PODE CONTER</Label>
              <Input
                id="alergenicos_pode_conter"
                placeholder="Ex: amendoim, castanhas"
                value={formData.alergenicos_pode_conter}
                onChange={(e) => setField('alergenicos_pode_conter', e.target.value)}
                className="bg-white text-gray-900"
              />
            </div>
          </div>

          <div className="flex flex-col items-center">
            <Label className="text-gray-900 text-sm mb-2 self-start">Pré-visualização</Label>
            <div className="w-[62mm]">
              <TabelaNutricionalPreview produto={formData} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}