import { Percent, Star, Zap, Lock, TrendingDown } from 'lucide-react';

export type DescontoFaixa = 'avista' | 'parcelado';

const VALOR_MINIMO_PARCELA = 90;

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

interface DiscountTierSelectorProps {
  selected: DescontoFaixa | undefined;
  onSelect: (faixa: DescontoFaixa) => void;
  valorTotal: number;
}

export default function DiscountTierSelector({ selected, onSelect, valorTotal }: DiscountTierSelectorProps) {
  const avistaValor = valorTotal * 0.5;
  const avistaEconomia = valorTotal - avistaValor;
  const avistaSelected = selected === 'avista';
  const avistaDisabled = avistaValor < VALOR_MINIMO_PARCELA;

  const parceladoValor = valorTotal * 0.7;
  const parceladoEconomia = valorTotal - parceladoValor;
  const parceladoSelected = selected === 'parcelado';
  const parceladoDisabled = (parceladoValor / 2) < VALOR_MINIMO_PARCELA;

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#ffffffaa' }}>
        💰 Escolha a melhor condição para você
      </p>

      {/* Card À Vista */}
      <button
        onClick={() => !avistaDisabled && onSelect('avista')}
        disabled={avistaDisabled}
        className="relative w-full rounded-2xl p-5 text-left transition-all duration-300 overflow-hidden group"
        style={{
          background: avistaSelected
            ? 'linear-gradient(135deg, #00a86b, #00cc88)'
            : 'linear-gradient(135deg, #00a86b33, #00cc8833)',
          border: avistaSelected ? '2px solid #00ff88' : '2px solid #00a86b55',
          boxShadow: avistaSelected ? '0 0 30px rgba(0, 168, 107, 0.4), 0 0 60px rgba(0, 168, 107, 0.1)' : '0 4px 20px rgba(0,0,0,0.2)',
          opacity: avistaDisabled ? 0.4 : 1,
          cursor: avistaDisabled ? 'not-allowed' : 'pointer',
          animation: !avistaDisabled ? 'pulse-border 2s ease-in-out infinite' : 'none',
        }}
      >
        <span
          className="absolute -top-0 right-4 text-xs font-black px-4 py-1.5 rounded-b-xl uppercase tracking-wide"
          style={{
            background: 'linear-gradient(135deg, #ff6b3d, #ff9a5c)',
            color: '#fff',
            animation: 'shimmer 2s ease-in-out infinite',
            boxShadow: '0 4px 15px rgba(255, 107, 61, 0.4)',
          }}
        >
          🔥 MELHOR OFERTA
        </span>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span style={{ color: avistaSelected ? '#fff' : '#ffd700', animation: 'float 3s ease-in-out infinite' }}>
                <Star className="h-7 w-7 fill-current" />
              </span>
              <span className="font-black text-xl" style={{ color: avistaSelected ? '#fff' : '#00ff88' }}>
                À Vista
              </span>
            </div>

            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-sm line-through" style={{ color: '#ff6b6b' }}>
                {formatCurrency(valorTotal)}
              </span>
              <span className="text-3xl font-black" style={{ color: avistaSelected ? '#fff' : '#00ff88' }}>
                {formatCurrency(avistaValor)}
              </span>
            </div>

            <p className="text-sm font-bold" style={{ color: avistaSelected ? '#ffffffdd' : '#ffffffaa' }}>
              Quite sua dívida hoje!
            </p>
          </div>

          <div className="text-right">
            <div
              className="inline-block rounded-xl px-4 py-2"
              style={{
                background: avistaSelected ? '#ffffff22' : '#00a86b22',
                border: '1px solid #00ff8844',
              }}
            >
              <p className="text-2xl font-black" style={{ color: '#00ff88' }}>50%</p>
              <p className="text-[10px] font-bold uppercase" style={{ color: '#00ff88cc' }}>OFF</p>
            </div>
          </div>
        </div>

        <div
          className="mt-3 rounded-lg px-3 py-2 flex items-center gap-2"
          style={{
            background: avistaSelected ? '#ffffff15' : '#00a86b15',
            border: '1px solid #00ff8833',
          }}
        >
          <TrendingDown className="h-4 w-4" style={{ color: '#00ff88' }} />
          <p className="text-sm font-bold" style={{ color: '#00ff88' }}>
            Você economiza {formatCurrency(avistaEconomia)}
          </p>
        </div>

        {avistaDisabled && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl" style={{ background: '#000000aa' }}>
            <div className="text-center">
              <Lock className="h-8 w-8 mx-auto mb-1" style={{ color: '#ffffff55' }} />
              <p className="text-xs" style={{ color: '#ffffff77' }}>Indisponível para este valor</p>
            </div>
          </div>
        )}
      </button>

      {/* Separador */}
      <div className="flex items-center gap-3 py-1">
        <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, #ffffff22, transparent)' }} />
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#ffffff55' }}>
          ou parcele com desconto
        </span>
        <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, #ffffff22, transparent)' }} />
      </div>

      {/* Card Parcelado */}
      <button
        onClick={() => !parceladoDisabled && onSelect('parcelado')}
        disabled={parceladoDisabled}
        className="relative w-full rounded-2xl p-5 text-left transition-all duration-300 overflow-hidden"
        style={{
          background: parceladoSelected
            ? 'linear-gradient(135deg, #00a86b22, #00cc8822)'
            : '#ffffff08',
          border: parceladoSelected ? '2px solid #00a86b' : '2px solid #ffffff12',
          boxShadow: parceladoSelected ? '0 4px 20px rgba(0,168,107,0.2)' : '0 4px 20px rgba(0,0,0,0.2)',
          opacity: parceladoDisabled ? 0.4 : 1,
          cursor: parceladoDisabled ? 'not-allowed' : 'pointer',
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span style={{ color: parceladoSelected ? '#00a86b' : '#ffffffaa' }}>
                <Zap className="h-6 w-6" />
              </span>
              <span className="font-black text-xl" style={{ color: parceladoSelected ? '#00a86b' : '#ffffffcc' }}>
                2 a 24x
              </span>
            </div>

            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-sm line-through" style={{ color: '#ff6b6b' }}>
                {formatCurrency(valorTotal)}
              </span>
              <span className="text-3xl font-black" style={{ color: '#00a86b' }}>
                {formatCurrency(parceladoValor)}
              </span>
            </div>

            <p className="text-sm font-bold" style={{ color: '#ffffffaa' }}>
              Parcele com desconto especial
            </p>
          </div>

          <div className="text-right">
            <div
              className="inline-block rounded-xl px-4 py-2"
              style={{
                background: parceladoSelected ? '#00a86b22' : '#ffffff08',
                border: '1px solid #00a86b44',
              }}
            >
              <p className="text-2xl font-black" style={{ color: '#00a86b' }}>30%</p>
              <p className="text-[10px] font-bold uppercase" style={{ color: '#00a86bcc' }}>OFF</p>
            </div>
          </div>
        </div>

        <div
          className="mt-3 rounded-lg px-3 py-2 flex items-center gap-2"
          style={{
            background: parceladoSelected ? '#00a86b15' : '#ffffff08',
            border: '1px solid #00a86b22',
          }}
        >
          <TrendingDown className="h-4 w-4" style={{ color: '#00a86b' }} />
          <p className="text-sm font-bold" style={{ color: '#00a86b' }}>
            Você economiza {formatCurrency(parceladoEconomia)}
          </p>
        </div>

        <p className="text-[9px] mt-2" style={{ color: '#ff6b6b99' }}>
          -20% desconto vs à vista
        </p>

        {parceladoDisabled && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl" style={{ background: '#000000aa' }}>
            <div className="text-center">
              <Lock className="h-8 w-8 mx-auto mb-1" style={{ color: '#ffffff55' }} />
              <p className="text-xs" style={{ color: '#ffffff77' }}>Indisponível para este valor</p>
            </div>
          </div>
        )}
      </button>
    </div>
  );
}

export function getDesconto(faixa: DescontoFaixa): number {
  return faixa === 'avista' ? 50 : 30;
}

export function getMinParcelas(faixa: DescontoFaixa): number {
  return faixa === 'avista' ? 1 : 2;
}

export function getMaxParcelasFaixa(faixa: DescontoFaixa): number {
  return faixa === 'avista' ? 1 : 24;
}
