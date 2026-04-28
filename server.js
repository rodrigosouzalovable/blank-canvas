// server.js - Robô CobMais com Playwright
// Execute: node server.js
// Requer: npm install express playwright

const express = require('express');
const { chromium } = require('playwright');

const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ===== CONFIGURAÇÕES =====
const COBMAIS_URL = 'https://app.cobmais.com.br';
const PORT = process.env.PORT || 3001;

let browser = null;
let page = null;
let currentStatus = 'idle';
let currentMessage = '';
let abortAgent = false; // Flag to stop agent execution

// ===== INICIALIZAR NAVEGADOR =====
async function initBrowser() {
  if (!browser) {
    browser = await chromium.launch({ 
      headless: false,
      args: ['--start-maximized']
    });
    const context = await browser.newContext({ 
      viewport: { width: 1366, height: 768 },
      ignoreHTTPSErrors: true 
    });
    page = await context.newPage();
    console.log('✅ Navegador iniciado');
  }
  return page;
}

// ===== HELPERS =====
function updateStatus(status, mensagem) {
  currentStatus = status;
  currentMessage = mensagem;
  console.log(`[${status.toUpperCase()}] ${mensagem}`);
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== ENDPOINT: STATUS =====
app.get('/status', (req, res) => {
  res.json({ 
    status: 'online', 
    online: true,
    currentAction: currentStatus,
    message: currentMessage,
    timestamp: new Date().toISOString()
  });
});

// ===== ENDPOINT: PARAR AGENTE =====
app.post('/automacao/stop', (req, res) => {
  abortAgent = true;
  updateStatus('stopped', 'Agente interrompido pelo usuário');
  console.log('🛑 Agente interrompido pelo usuário');
  res.json({ success: true, message: 'Agente interrompido' });
});

app.get('/screenshot', async (req, res) => {
  try {
    if (!page) {
      return res.json({ image: null, url: '', status: currentStatus });
    }
    const screenshot = await page.screenshot({ type: 'jpeg', quality: 60 });
    const base64 = `data:image/jpeg;base64,${screenshot.toString('base64')}`;
    res.json({ 
      image: base64, 
      url: page.url(), 
      status: `${currentStatus}: ${currentMessage}` 
    });
  } catch (err) {
    res.json({ image: null, url: '', status: 'erro ao capturar tela' });
  }
});

// ===== ENDPOINT PRINCIPAL =====
app.post('/automacao/cobmais', async (req, res) => {
  const { acao, parametros, cobmais_email, cobmais_senha } = req.body;

  if (acao === 'gerar_boleto') {
    try {
      const result = await gerarBoleto(parametros, cobmais_email, cobmais_senha);
      res.json(result);
    } catch (err) {
      console.error('❌ Erro gerar_boleto:', err.message);
      res.json({ 
        success: false, 
        error: err.message,
        etapa: currentMessage 
      });
    }
  } else {
    res.json({ error: `Ação desconhecida: ${acao}` });
  }
});

// ===== FLUXO COMPLETO: GERAR BOLETO =====
async function gerarBoleto({ cpf, valor_final, tipo_pagamento, parcelas }, cobmais_email, cobmais_senha) {
  const pg = await initBrowser();
  const startTime = Date.now();

  if (!cpf) throw new Error('CPF não informado');
  if (!valor_final) throw new Error('Valor final não informado');

  const cpfLimpo = cpf.replace(/\D/g, '');

  console.log(`\n🚀 Iniciando geração de boleto`);
  console.log(`   CPF: ${cpfLimpo}`);
  console.log(`   Valor: R$ ${valor_final}`);
  console.log(`   Parcelas: ${parcelas || 1}`);

  // ── PASSO 1: Verificar se está logado ──
  updateStatus('executando', 'Passo 1: Verificando login...');

  try {
    await pg.goto(`${COBMAIS_URL}/cob/pesquisa`, { 
      waitUntil: 'networkidle', 
      timeout: 15000 
    });
  } catch (e) {
    console.log('⚠️ Timeout na navegação, verificando página...');
  }

  const currentUrl = pg.url();

  // ── PASSO 2: Login (se necessário) ──
  if (currentUrl.includes('Account/Login') || currentUrl.includes('login')) {
    updateStatus('executando', 'Passo 2: Fazendo login...');

    if (!cobmais_email || !cobmais_senha) {
      throw new Error('Credenciais do CobMais não configuradas');
    }

    await pg.waitForSelector('input#Username', { timeout: 10000 });
    await pg.fill('input#Username', '');
    await pg.fill('input#Username', cobmais_email);

    await pg.waitForSelector('input#Password', { timeout: 5000 });
    await pg.fill('input#Password', '');
    await pg.fill('input#Password', cobmais_senha);

    const btnEntrar = await pg.$('button[type="submit"], input[type="submit"]');
    if (btnEntrar) {
      await btnEntrar.click();
    } else {
      await pg.click('button:has-text("Entrar"), a:has-text("Entrar")');
    }

    await pg.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
    await delay(3000);

    const afterLoginUrl = pg.url();
    if (afterLoginUrl.includes('Login') || afterLoginUrl.includes('login')) {
      throw new Error('Falha no login - verifique usuário e senha');
    }

    console.log('✅ Login realizado com sucesso');
  } else {
    console.log('✅ Já estava logado');
  }

  // ── PASSO 3: Navegar para pesquisa ──
  updateStatus('executando', 'Passo 3: Navegando para pesquisa...');

  if (!pg.url().includes('/cob/pesquisa')) {
    await pg.goto(`${COBMAIS_URL}/cob/pesquisa`, { 
      waitUntil: 'networkidle', 
      timeout: 15000 
    }).catch(() => {});
    await delay(2000);
  }

  console.log('✅ Na página de pesquisa');

  // ── PASSO 4: Pesquisar CPF ──
  updateStatus('executando', `Passo 4: Pesquisando CPF ${cpfLimpo}...`);

  await pg.waitForSelector('input#txtCPFCNPJ', { timeout: 10000 });
  await pg.fill('input#txtCPFCNPJ', '');
  await pg.fill('input#txtCPFCNPJ', cpfLimpo);

  await pg.waitForSelector('#btnPesquisar', { timeout: 5000 });
  await pg.click('#btnPesquisar');

  await delay(3000);
  console.log('✅ Pesquisa realizada');

  // ── PASSO 5: Selecionar o devedor ──
  updateStatus('executando', 'Passo 5: Selecionando devedor...');

  const resultSelectors = [
    'table tbody tr:first-child td a',
    'table tbody tr:first-child',
    '#gridPesquisa tbody tr:first-child td a',
    'a[href*="telecobranca"]',
    'a[href*="Telecobranca"]',
  ];

  let clicked = false;
  for (const sel of resultSelectors) {
    try {
      const el = await pg.$(sel);
      if (el) {
        await el.click();
        clicked = true;
        console.log(`   Clicou no resultado: ${sel}`);
        break;
      }
    } catch (e) {
      continue;
    }
  }

  if (!clicked) {
    try {
      await pg.click(`a:has-text("${cpfLimpo.substring(0, 3)}")`);
      clicked = true;
    } catch (e) {
      throw new Error(`CPF ${cpf} não encontrado no CobMais`);
    }
  }

  await delay(5000);
  console.log('✅ Devedor selecionado - ficha aberta');

  // ── PASSO 6: Clicar em Cálculo (scroll + click) ──
  updateStatus('executando', 'Passo 6: Abrindo cálculo...');

  // O botão Cálculo é um <a> com id="btnCalcular" dentro de div#divCalculo
  // Pode estar fora da viewport, então fazemos scroll primeiro
  const calcSelectors = [
    '#btnCalcular',
    'a#btnCalcular',
    '#divCalculo a',
    '#divCalculo button',
    'a:has-text("Cálculo")',
    'a:has-text("Calculo")',
    'button:has-text("Cálculo")',
  ];

  let calcClicked = false;
  for (const sel of calcSelectors) {
    try {
      const el = await pg.$(sel);
      if (el) {
        // Scroll até o elemento ficar visível
        await el.scrollIntoViewIfNeeded();
        await delay(500);
        await el.click();
        calcClicked = true;
        console.log(`   Clicou em Cálculo: ${sel}`);
        break;
      }
    } catch (e) {
      console.log(`   Tentativa ${sel} falhou: ${e.message}`);
      continue;
    }
  }

  if (!calcClicked) {
    // Última tentativa: scroll até o final e procurar por JavaScript
    console.log('   Tentando via JavaScript...');
    try {
      await pg.evaluate(() => {
        const el = document.querySelector('#btnCalcular') || document.querySelector('a[id="btnCalcular"]');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.click();
          return true;
        }
        // Tentar por texto
        const links = document.querySelectorAll('a');
        for (const link of links) {
          if (link.textContent && link.textContent.trim().includes('álculo')) {
            link.scrollIntoView({ behavior: 'smooth', block: 'center' });
            link.click();
            return true;
          }
        }
        return false;
      });
      calcClicked = true;
      console.log('   Clicou via JavaScript');
    } catch (e) {
      console.log(`   JavaScript também falhou: ${e.message}`);
    }
  }

  if (!calcClicked) {
    throw new Error('Botão "Cálculo" não encontrado na página. Verifique se a ficha do devedor abriu corretamente.');
  }

  await delay(4000);
  console.log('✅ Tela de cálculo aberta');

  // ── PASSO 7: Preencher valor negociado ──
  updateStatus('executando', `Passo 7: Preenchendo valor R$ ${valor_final}...`);

  const valorFormatado = parseFloat(valor_final).toFixed(2).replace('.', ',');

  await pg.waitForSelector('input#txtValorFinal', { timeout: 10000 });
  await pg.click('input#txtValorFinal', { clickCount: 3 });
  await pg.fill('input#txtValorFinal', '');
  await pg.type('input#txtValorFinal', valorFormatado, { delay: 50 });

  if (parcelas && parcelas > 1) {
    const parcelasSelectors = [
      'input#txtNumeroParcelas',
      'input[id*="parcela"]',
      'input[id*="Parcela"]',
      'select#ddlParcelas',
    ];

    for (const sel of parcelasSelectors) {
      try {
        const el = await pg.$(sel);
        if (el) {
          const tagName = await el.evaluate(e => e.tagName.toLowerCase());
          if (tagName === 'select') {
            await pg.selectOption(sel, String(parcelas));
          } else {
            await pg.click(sel, { clickCount: 3 });
            await pg.fill(sel, '');
            await pg.type(sel, String(parcelas), { delay: 50 });
          }
          console.log(`   Preencheu parcelas: ${parcelas}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }
  }

  await delay(1000);
  console.log(`✅ Valor preenchido: R$ ${valorFormatado}`);

  // ── PASSO 8: Clicar em Atualizar (botão verde) ──
  updateStatus('executando', 'Passo 8: Clicando em Atualizar...');

  const atualizarSelectors = [
    '#btnAtualizarCalculo',
    'button#btnAtualizarCalculo',
    'button.btn-success:has-text("Atualizar")',
    'button:has-text("Atualizar")',
    'input[value="Atualizar"]',
  ];

  let atualizarClicked = false;
  for (const sel of atualizarSelectors) {
    try {
      const el = await pg.$(sel);
      if (el) {
        await el.scrollIntoViewIfNeeded();
        await delay(300);
        await el.click();
        atualizarClicked = true;
        console.log(`   Clicou em Atualizar: ${sel}`);
        break;
      }
    } catch (e) {
      continue;
    }
  }

  if (!atualizarClicked) {
    console.log('⚠️ Botão Atualizar não encontrado, continuando...');
  }

  await delay(3000);
  console.log('✅ Cálculo atualizado');

  // ── PASSO 9: Salvar o acordo ──
  updateStatus('executando', 'Passo 9: Salvando acordo...');

  // Interceptar PDF em responses e novas abas
  let boletoUrl = null;

  pg.on('response', async (response) => {
    const url = response.url();
    if (url.includes('gerapdf') || url.includes('GerarPDF') || url.includes('boleto') || url.includes('.pdf')) {
      boletoUrl = url;
      console.log(`   📄 URL do boleto capturada via response: ${url}`);
    }
  });

  const context = pg.context();
  context.on('page', async (newPage) => {
    const newUrl = newPage.url();
    console.log(`   📄 Nova aba aberta: ${newUrl}`);
    if (newUrl.includes('gerapdf') || newUrl.includes('GerarPDF') || newUrl.includes('boleto') || newUrl.includes('.pdf')) {
      boletoUrl = newUrl;
    }
    try {
      await newPage.waitForLoadState('networkidle', { timeout: 10000 });
      const finalUrl = newPage.url();
      if (finalUrl.includes('gerapdf') || finalUrl.includes('.pdf')) {
        boletoUrl = finalUrl;
        console.log(`   📄 URL final da nova aba: ${finalUrl}`);
      }
    } catch (e) {}
  });

  const btnSalvar = await pg.$('#btnSalvarCalc');
  if (btnSalvar) {
    await btnSalvar.scrollIntoViewIfNeeded();
    await delay(300);
    await btnSalvar.click();
  } else {
    // Fallback
    await pg.click('button:has-text("Salvar"), button.btn-primary:has-text("Salvar")');
  }
  await delay(5000);

  // Verificar se CobMais pediu e-mail
  try {
    const emailError = await pg.$('text=e-mail, text=email, text=Email');
    if (emailError) {
      console.log('⚠️ CobMais pediu e-mail, preenchendo email@email.com...');
      const emailInputSelectors = [
        'input[type="email"]',
        'input[id*="email"]',
        'input[id*="Email"]',
        'input[name*="email"]',
      ];
      for (const sel of emailInputSelectors) {
        try {
          const el = await pg.$(sel);
          if (el) {
            await pg.fill(sel, 'email@email.com');
            console.log('   Preencheu e-mail');
            const btnSalvar2 = await pg.$('#btnSalvarCalc');
            if (btnSalvar2) await btnSalvar2.click();
            await delay(5000);
            break;
          }
        } catch (e) {
          continue;
        }
      }
    }
  } catch (e) {}

  console.log('✅ Acordo salvo');

  // ── PASSO 10: Clicar no dropdown amarelo (Acordo) ──
  updateStatus('executando', 'Passo 10: Abrindo menu de Acordo...');

  await delay(3000);

  const dropdownSelectors = [
    'span.ev-btn.ev-btn-amarelo',
    '.ev-btn-amarelo',
    'button.ev-btn-amarelo',
    'a.ev-btn-amarelo',
    'span.ev-btn:has-text("Acordo")',
  ];

  let dropdownClicked = false;
  for (const sel of dropdownSelectors) {
    try {
      const el = await pg.$(sel);
      if (el) {
        await el.scrollIntoViewIfNeeded();
        await delay(300);
        await el.click();
        dropdownClicked = true;
        console.log(`   Clicou no dropdown amarelo: ${sel}`);
        break;
      }
    } catch (e) {
      continue;
    }
  }

  if (!dropdownClicked) {
    console.log('⚠️ Dropdown amarelo não encontrado, tentando buscar boleto diretamente...');
  }

  await delay(2000);
  console.log('✅ Menu de acordo aberto');

  // ── PASSO 11: Clicar em Emitir Boletos ──
  updateStatus('executando', 'Passo 11: Clicando em Emitir Boletos...');

  const emitirSelectors = [
    'a.gerar-boleto',
    'a:has-text("Emitir Boleto")',
    'a:has-text("Gerar Boleto")',
    'a:has-text("Boleto")',
    'li a.gerar-boleto',
  ];

  let emitirClicked = false;
  for (const sel of emitirSelectors) {
    try {
      const el = await pg.$(sel);
      if (el) {
        await el.click();
        emitirClicked = true;
        console.log(`   Clicou em Emitir Boletos: ${sel}`);
        break;
      }
    } catch (e) {
      continue;
    }
  }

  if (!emitirClicked) {
    console.log('⚠️ Link "Emitir Boletos" não encontrado');
  }

  await delay(3000);
  console.log('✅ Tela de boletos aberta');

  // ── PASSO 12: Selecionar Todos e Imprimir ──
  async function selecionarTodosEImprimir() {
    updateStatus('executando', 'Passo 12: Selecionando boletos e imprimindo...');

    // Marcar "Selecionar Todos" - usar label pois o checkbox está dentro de span.nice-checkbox
    const ckbSelectors = [
      'label[for="ckbTodosBoletos"]',
      'label:has-text("Selecionar Todos")',
      '#ckbTodosBoletos',
      'input#ckbTodosBoletos',
      'input[type="checkbox"][id*="Todos"]',
    ];

    let selecionouTodos = false;
    for (const sel of ckbSelectors) {
      try {
        const el = await pg.$(sel);
        if (el) {
          await el.scrollIntoViewIfNeeded();
          await delay(300);
          await el.click();
          selecionouTodos = true;
          console.log(`   Marcou Selecionar Todos: ${sel}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!selecionouTodos) {
      // Fallback: clicar via JavaScript
      try {
        await pg.evaluate(() => {
          const cb = document.querySelector('#ckbTodosBoletos');
          if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); return; }
          const labels = document.querySelectorAll('label');
          for (const l of labels) {
            if (l.textContent && l.textContent.includes('Selecionar Todos')) { l.click(); return; }
          }
        });
        console.log('   Marcou Selecionar Todos via JavaScript');
      } catch (e) {
        console.log('⚠️ Não conseguiu marcar Selecionar Todos');
      }
    }

    await delay(1000);

    // Clicar em Imprimir / Confirmar Boleto
    const imprimirSelectors = [
      '#btnConfirmarBoleto',
      'button#btnConfirmarBoleto',
      'button:has-text("Imprimir")',
      'a:has-text("Imprimir")',
      '#btnImprimir',
    ];

    for (const sel of imprimirSelectors) {
      try {
        const el = await pg.$(sel);
        if (el) {
          await el.scrollIntoViewIfNeeded();
          await delay(300);
          const href = await el.getAttribute('href');
          if (href && (href.includes('gerapdf') || href.includes('.pdf'))) {
            boletoUrl = href.startsWith('http') ? href : `${COBMAIS_URL}${href}`;
            console.log(`   📄 URL do boleto via href: ${boletoUrl}`);
          } else {
            await el.click();
            console.log(`   Clicou em Imprimir: ${sel}`);
          }
          break;
        }
      } catch (e) {
        continue;
      }
    }

    await delay(5000);

    // ── Verificar erro de email ──
    let erroEmail = false;
    try {
      const toastEl = await pg.$('div.toast-message');
      if (toastEl) {
        const toastText = await toastEl.textContent();
        if (toastText && (toastText.toLowerCase().includes('email') || toastText.toLowerCase().includes('e-mail'))) {
          erroEmail = true;
          console.log(`⚠️ Erro de email detectado: ${toastText}`);
        }
      }
    } catch (e) {}

    // Fallback: verificar qualquer texto de erro de email na página
    if (!erroEmail) {
      try {
        const pageText = await pg.textContent('body');
        if (pageText && pageText.includes('Email do cliente não pode ficar em branco')) {
          erroEmail = true;
          console.log('⚠️ Erro de email detectado no body');
        }
      } catch (e) {}
    }

    if (erroEmail) {
      console.log('🔄 Iniciando recuperação: cadastrar email...');
      updateStatus('executando', 'Cadastrando email do cliente...');

      // Fechar modal de boleto
      const fecharSelectors = ['#btnFecharBoleto', 'button:has-text("Cancelar")', 'button.close', '.modal .close'];
      for (const sel of fecharSelectors) {
        try {
          const el = await pg.$(sel);
          if (el) { await el.click(); console.log(`   Fechou modal: ${sel}`); break; }
        } catch (e) { continue; }
      }
      await delay(2000);

      // Clicar na aba "E-mail"
      const emailTabSelectors = ['a[href="#tabEmail"]', 'a:has-text("E-mail")', 'a:has-text("Email")', 'li a[href*="Email"]'];
      for (const sel of emailTabSelectors) {
        try {
          const el = await pg.$(sel);
          if (el) { await el.scrollIntoViewIfNeeded(); await delay(300); await el.click(); console.log(`   Abriu aba Email: ${sel}`); break; }
        } catch (e) { continue; }
      }
      await delay(2000);

      // Clicar em "+ Novo"
      const novoSelectors = ['a#btnNovoItem', '#btnNovoItem', 'a:has-text("Novo")', 'button:has-text("Novo")'];
      for (const sel of novoSelectors) {
        try {
          const el = await pg.$(sel);
          if (el) { await el.scrollIntoViewIfNeeded(); await delay(300); await el.click(); console.log(`   Clicou em Novo: ${sel}`); break; }
        } catch (e) { continue; }
      }
      await delay(2000);

      // Preencher email
      const emailInputSelectors = ['input#txtEmail', 'input[id*="Email"]', 'input[type="email"]', 'input[name*="email"]'];
      for (const sel of emailInputSelectors) {
        try {
          const el = await pg.$(sel);
          if (el) {
            await pg.fill(sel, '');
            await pg.fill(sel, 'email@email.com');
            console.log(`   Preencheu email: ${sel}`);
            break;
          }
        } catch (e) { continue; }
      }
      await delay(1000);

      // Salvar email
      const salvarEmailSelectors = ['button#btnSalvarEmail', '#btnSalvarEmail', 'button:has-text("Salvar")'];
      for (const sel of salvarEmailSelectors) {
        try {
          const el = await pg.$(sel);
          if (el) { await el.click(); console.log(`   Salvou email: ${sel}`); break; }
        } catch (e) { continue; }
      }
      await delay(3000);
      console.log('✅ Email cadastrado');

      // Refazer emissão: dropdown amarelo > Emitir Boleto > Selecionar Todos > Imprimir
      updateStatus('executando', 'Refazendo emissão de boleto...');

      // Dropdown amarelo
      for (const sel of dropdownSelectors) {
        try {
          const el = await pg.$(sel);
          if (el) { await el.scrollIntoViewIfNeeded(); await delay(300); await el.click(); console.log(`   Re-clicou dropdown: ${sel}`); break; }
        } catch (e) { continue; }
      }
      await delay(2000);

      // Emitir Boletos
      for (const sel of emitirSelectors) {
        try {
          const el = await pg.$(sel);
          if (el) { await el.click(); console.log(`   Re-clicou Emitir: ${sel}`); break; }
        } catch (e) { continue; }
      }
      await delay(3000);

      // Recursão: tentar selecionar e imprimir novamente
      return await selecionarTodosEImprimir();
    }

    // Sem erro de email - aguardar mais para PDF
    await delay(3000);
  }

  await selecionarTodosEImprimir();

  // Verificar URLs em todas as abas abertas
  if (!boletoUrl) {
    const pages = context.pages();
    for (const p of pages) {
      const pUrl = p.url();
      if (pUrl.includes('gerapdf') || pUrl.includes('.pdf') || pUrl.includes('boleto')) {
        boletoUrl = pUrl;
        console.log(`   📄 URL do boleto encontrada em aba: ${pUrl}`);
        break;
      }
    }
  }

  const tempo = Date.now() - startTime;

  if (!boletoUrl) {
    console.log('❌ Boleto URL não capturada');
    updateStatus('erro', 'URL do boleto não encontrada');
    return {
      success: false,
      error: 'Acordo possivelmente salvo, mas URL do boleto não foi capturada. Verifique manualmente no CobMais.',
      tempo_ms: tempo
    };
  }

  console.log(`\n🎉 Boleto gerado com sucesso!`);
  console.log(`   URL: ${boletoUrl}`);
  console.log(`   Tempo: ${tempo}ms`);

  updateStatus('sucesso', `Boleto gerado! URL: ${boletoUrl}`);

  return {
    success: true,
    sucesso: true,
    boleto_url: boletoUrl,
    mensagem: `Boleto gerado com sucesso para CPF ${cpf}`,
    tempo_ms: tempo
  };
}
// ===== ENDPOINT: AÇÃO DIRETA (sem IA de visão) =====
app.post('/automacao/acao-direta', async (req, res) => {
  const { action, selector, value, url } = req.body;

  if (!action) {
    return res.json({ success: false, error: 'Campo action é obrigatório' });
  }

  try {
    const pg = await initBrowser();
    const startTime = Date.now();
    updateStatus('executando', `Ação direta: ${action} ${selector || value || url || ''}`);

    switch (action) {
      case 'navigate': {
        if (!url) return res.json({ success: false, error: 'Campo url é obrigatório para navigate' });
        await pg.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        await delay(1000);
        break;
      }
      case 'click': {
        if (!selector) return res.json({ success: false, error: 'Campo selector é obrigatório para click' });
        const el = await pg.$(selector);
        if (!el) {
          // Fallback: try text-based selector
          try {
            await pg.click(`text=${selector}`, { timeout: 3000 });
          } catch {
            return res.json({ success: false, error: `Elemento não encontrado: ${selector}` });
          }
        } else {
          await el.scrollIntoViewIfNeeded();
          await delay(200);
          await el.click();
        }
        await delay(200);
        break;
      }
      case 'fill': {
        if (!selector || value === undefined) return res.json({ success: false, error: 'Campos selector e value são obrigatórios para fill' });
        const fillEl = await pg.$(selector);
        if (!fillEl) return res.json({ success: false, error: `Elemento não encontrado: ${selector}` });
        await fillEl.scrollIntoViewIfNeeded();
        await pg.fill(selector, '');
        await pg.type(selector, value, { delay: 20 });
        await delay(200);
        break;
      }
      case 'keypress': {
        const key = value || selector || 'Enter';
        await pg.keyboard.press(key);
        await delay(200);
        break;
      }
      case 'scroll': {
        if (selector) {
          const scrollEl = await pg.$(selector);
          if (scrollEl) await scrollEl.scrollIntoViewIfNeeded();
        } else {
          await pg.evaluate(() => window.scrollBy(0, 400));
        }
        await delay(200);
        break;
      }
      case 'select': {
        if (!selector || !value) return res.json({ success: false, error: 'Campos selector e value são obrigatórios para select' });
        await pg.selectOption(selector, value);
        await delay(200);
        break;
      }
      case 'click_at_position': {
        const x = parseInt(req.body.x);
        const y = parseInt(req.body.y);
        if (isNaN(x) || isNaN(y)) return res.json({ success: false, error: 'Campos x e y são obrigatórios para click_at_position' });
        await pg.mouse.click(x, y);
        await delay(500);
        break;
      }
      default:
        return res.json({ success: false, error: `Ação desconhecida: ${action}` });
    }

    const tempo = Date.now() - startTime;
    updateStatus('idle', `Ação direta concluída em ${tempo}ms`);
    res.json({ success: true, action, tempo_ms: tempo, url: pg.url() });
  } catch (err) {
    console.error('❌ Erro ação direta:', err.message);
    updateStatus('erro', err.message);
    res.json({ success: false, error: err.message });
  }
});

// ===== ENDPOINT: AGENTE INTELIGENTE =====
app.post('/automacao/agent', async (req, res) => {
  const { objective, parametros, cobmais_email, cobmais_senha, supabase_url, max_iterations } = req.body;

  if (!objective) {
    return res.json({ success: false, error: 'Campo objective é obrigatório' });
  }

  abortAgent = false; // Reset abort flag
  // Sem limite fixo de iterações — controlado apenas pelo timeout de 5 min
  const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  const startTime = Date.now();
  const history = [];
  let boletoUrl = null;

  try {
    const pg = await initBrowser();
    updateStatus('agent', `Agente iniciado: ${objective}`);

    // Setup PDF/boleto URL interceptor
    pg.on('response', async (response) => {
      const url = response.url();
      if (url.includes('gerapdf') || url.includes('GerarPDF') || url.includes('boleto') || url.includes('.pdf')) {
        boletoUrl = url;
        console.log(`   📄 [Agent] Boleto URL capturada: ${url}`);
      }
    });

    const context = pg.context();
    context.on('page', async (newPage) => {
      const newUrl = newPage.url();
      if (newUrl.includes('gerapdf') || newUrl.includes('.pdf') || newUrl.includes('boleto')) {
        boletoUrl = newUrl;
      }
      try {
        await newPage.waitForLoadState('networkidle', { timeout: 10000 });
        const finalUrl = newPage.url();
        if (finalUrl.includes('gerapdf') || finalUrl.includes('.pdf')) {
          boletoUrl = finalUrl;
        }
      } catch (e) {}
    });

    // Inject credentials into objective context
    let fullObjective = objective;
    if (cobmais_email && cobmais_senha) {
      fullObjective += `\n\nCredenciais CobMais: usuário="${cobmais_email}", senha="${cobmais_senha}"`;
    }
    if (parametros) {
      fullObjective += `\nParâmetros: ${JSON.stringify(parametros)}`;
    }

    const analyzeUrl = `${supabase_url || process.env.SUPABASE_URL || 'https://cymdrkeukockakfzjeen.supabase.co'}/functions/v1/analyze-cobmais-screen`;

    for (let i = 0; ; i++) {
      // Check abort flag
      if (abortAgent) {
        updateStatus('stopped', 'Agente interrompido pelo usuário');
        return res.json({
          success: false,
          error: 'Agente interrompido pelo usuário',
          history,
          iterations: i,
          tempo_ms: Date.now() - startTime,
        });
      }

      // Check timeout
      if (Date.now() - startTime > TIMEOUT_MS) {
        updateStatus('erro', 'Timeout: agente excedeu 5 minutos');
        return res.json({
          success: false,
          error: 'Timeout: agente excedeu limite de 5 minutos',
          history,
          iterations: i,
          tempo_ms: Date.now() - startTime,
        });
      }

      updateStatus('agent', `Iteração ${i + 1}: analisando tela...`);

      // 1. Capture screenshot
      let screenshot;
      try {
        const screenshotBuffer = await pg.screenshot({ type: 'jpeg', quality: 25 });
        screenshot = `data:image/jpeg;base64,${screenshotBuffer.toString('base64')}`;
      } catch (e) {
        console.log('❌ Erro ao capturar screenshot:', e.message);
        history.push({ action: 'screenshot_error', description: 'Falha ao capturar tela', result: e.message });
        continue;
      }

      const currentUrl = pg.url();

      // 2. Call AI
      let aiAction;
      try {
        const aiRes = await fetch(analyzeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            screenshot,
            objective: fullObjective,
            history,
            current_url: currentUrl,
          }),
          signal: AbortSignal.timeout(20000),
        });
        const aiData = await aiRes.json();
        if (!aiData.success || !aiData.action) {
          console.log('⚠️ IA não retornou ação válida:', JSON.stringify(aiData));
          history.push({ action: 'ai_error', description: 'IA não retornou ação válida', result: aiData.error || 'unknown' });
          await delay(1000);
          continue;
        }
        aiAction = aiData.action;
      } catch (e) {
        console.log('❌ Erro ao chamar IA:', e.message);
        history.push({ action: 'ai_call_error', description: 'Falha na chamada da IA', result: e.message });
        await delay(1500);
        continue;
      }

      console.log(`🤖 [Agent ${i + 1}] ${aiAction.action}: ${aiAction.description} (conf: ${aiAction.confidence})`);

      // 3. Check confidence threshold
      if (aiAction.confidence < 0.7 && aiAction.action !== 'done' && aiAction.action !== 'error') {
        console.log(`⚠️ Confiança baixa (${aiAction.confidence}), parando para revisão humana`);
        history.push({
          action: aiAction.action,
          description: aiAction.description,
          result: `Parado: confiança baixa (${aiAction.confidence})`,
        });
        updateStatus('paused', `Confiança baixa (${aiAction.confidence}) - revisão necessária`);
        return res.json({
          success: false,
          error: `Agente parou: confiança baixa (${aiAction.confidence}). Ação sugerida: ${aiAction.description}`,
          suggested_action: aiAction,
          history,
          iterations: i + 1,
          tempo_ms: Date.now() - startTime,
        });
      }

      // 4. Check if done
      if (aiAction.done || aiAction.action === 'done') {
        updateStatus('sucesso', `Agente concluiu: ${aiAction.description}`);
        // Check for boleto URL in result_data or captured
        const finalBoletoUrl = aiAction.result_data?.boleto_url || boletoUrl;
        history.push({ action: 'done', description: aiAction.description, result: 'concluido' });
        return res.json({
          success: true,
          boleto_url: finalBoletoUrl || null,
          mensagem: aiAction.description,
          result_data: aiAction.result_data || {},
          history,
          iterations: i + 1,
          tempo_ms: Date.now() - startTime,
        });
      }

      // 5. Check if error
      if (aiAction.action === 'error') {
        updateStatus('erro', aiAction.error_message || aiAction.description);
        history.push({ action: 'error', description: aiAction.description, result: aiAction.error_message });
        return res.json({
          success: false,
          error: aiAction.error_message || aiAction.description,
          history,
          iterations: i + 1,
          tempo_ms: Date.now() - startTime,
        });
      }

      // 6. Execute action
      let actionResult = 'ok';
      try {
        switch (aiAction.action) {
          case 'click': {
            const el = await pg.$(aiAction.selector);
            if (el) {
            await el.scrollIntoViewIfNeeded();
              await delay(200);
              await el.click();
            } else {
              // Fallback: try via evaluate
              const clicked = await pg.evaluate((sel) => {
                const e = document.querySelector(sel);
                if (e) { e.scrollIntoView({ block: 'center' }); e.click(); return true; }
                return false;
              }, aiAction.selector);
              if (!clicked) actionResult = `Elemento não encontrado: ${aiAction.selector}`;
            }
            await delay(1000);
            break;
          }
          case 'fill': {
            await pg.waitForSelector(aiAction.selector, { timeout: 5000 });
            await pg.click(aiAction.selector, { clickCount: 3 });
            await pg.fill(aiAction.selector, '');
            await pg.type(aiAction.selector, aiAction.value || '', { delay: 20 });
            await delay(300);
            break;
          }
          case 'scroll': {
            const dir = (aiAction.value || 'down').toLowerCase();
            await pg.evaluate((direction) => {
              window.scrollBy(0, direction === 'up' ? -400 : 400);
            }, dir);
            await delay(500);
            break;
          }
          case 'wait': {
            const waitMs = parseInt(aiAction.value || '2000', 10);
            await delay(Math.min(waitMs, 5000));
            break;
          }
          case 'navigate': {
            await pg.goto(aiAction.value || '', { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
            await delay(1000);
            break;
          }
          case 'select': {
            await pg.selectOption(aiAction.selector, aiAction.value || '');
            await delay(500);
            break;
          }
          case 'keypress': {
            const key = aiAction.value || 'F5';
            console.log(`⌨️ Pressionando tecla: ${key}`);
            await pg.keyboard.press(key);
            await delay(1000);
            break;
          }
          default:
            actionResult = `Ação desconhecida: ${aiAction.action}`;
        }
      } catch (e) {
        actionResult = `Erro: ${e.message}`;
        console.log(`❌ Erro ao executar ${aiAction.action}: ${e.message}`);
      }

      history.push({
        action: aiAction.action,
        selector: aiAction.selector,
        value: aiAction.value,
        description: aiAction.description,
        confidence: aiAction.confidence,
        result: actionResult,
      });

      updateStatus('agent', `Iteração ${i + 1}: ${aiAction.description} → ${actionResult}`);
    }

    // Loop só termina por: done, error, abort, timeout ou confiança baixa
  } catch (err) {
    console.error('❌ Erro no agente:', err.message);
    return res.json({
      success: false,
      error: err.message,
      history,
      tempo_ms: Date.now() - startTime,
    });
  }
});

// ===== MODO GRAVAÇÃO: Estado =====
let recording = false;
let recordingSession = null; // { sessao_id, nome_fluxo, supabase_url, supabase_key, step_count }

// ===== ENDPOINT: INICIAR GRAVAÇÃO =====
app.post('/automacao/gravar', async (req, res) => {
  const { sessao_id, nome_fluxo, supabase_url, supabase_key } = req.body;

  if (!sessao_id || !nome_fluxo) {
    return res.json({ success: false, error: 'sessao_id e nome_fluxo são obrigatórios' });
  }

  try {
    const pg = await initBrowser();

    recordingSession = { sessao_id, nome_fluxo, supabase_url, supabase_key, step_count: 0 };
    recording = true;

    // Expose helper to intercept user actions
    await pg.exposeFunction('__recordAction', async (actionData) => {
      if (!recording || !recordingSession) return;
      recordingSession.step_count++;
      const step = {
        sessao_id: recordingSession.sessao_id,
        nome_fluxo: recordingSession.nome_fluxo,
        passo_numero: recordingSession.step_count,
        acao: actionData.type,
        seletor: actionData.selector || null,
        valor: actionData.value || null,
        url_pagina: actionData.url || null,
        descricao_tela: actionData.description || null,
      };

      // Save to Supabase
      try {
        const saveRes = await fetch(`${recordingSession.supabase_url}/rest/v1/cobmais_conhecimento`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': recordingSession.supabase_key,
            'Authorization': `Bearer ${recordingSession.supabase_key}`,
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify(step),
        });
        if (!saveRes.ok) {
          console.log(`⚠️ Erro ao salvar passo ${recordingSession.step_count}:`, await saveRes.text());
        } else {
          console.log(`📝 Passo ${recordingSession.step_count} gravado: [${actionData.type}] ${actionData.selector || ''}`);
        }
      } catch (e) {
        console.log(`⚠️ Erro ao salvar passo: ${e.message}`);
      }
    }).catch(() => {
      // Function might already be exposed from previous session
    });

    // Inject recording script into the page
    await pg.evaluate(() => {
      if (window.__recordingActive) return;
      window.__recordingActive = true;

      // Helper to build CSS selector
      function getSelector(el) {
        if (el.id) return `#${el.id}`;
        if (el.name) return `[name="${el.name}"]`;
        const tag = el.tagName.toLowerCase();
        const classes = Array.from(el.classList).slice(0, 2).join('.');
        if (classes) return `${tag}.${classes}`;
        return tag;
      }

      // Track clicks
      document.addEventListener('click', (e) => {
        const target = e.target;
        if (!target || !target.tagName) return;
        const selector = getSelector(target);
        const text = (target.textContent || '').trim().substring(0, 50);
        window.__recordAction({
          type: 'click',
          selector,
          value: text,
          url: window.location.href,
          description: `Clicou em ${selector} (${text})`,
        });
      }, true);

      // Track input changes
      document.addEventListener('change', (e) => {
        const target = e.target;
        if (!target || !target.tagName) return;
        const selector = getSelector(target);
        const value = target.value || '';
        window.__recordAction({
          type: 'fill',
          selector,
          value,
          url: window.location.href,
          description: `Preencheu ${selector} com "${value.substring(0, 30)}"`,
        });
      }, true);
    });

    // Also track navigation - with dedup filter
    let lastRecordedUrl = '';
    pg.on('framenavigated', (frame) => {
      if (frame === pg.mainFrame() && recording && recordingSession) {
        const url = frame.url();
        
        // Skip noise: chrome-error, same URL as last, about:blank, callback/auth redirects
        if (
          url.includes('chrome-error://') ||
          url === 'about:blank' ||
          url === lastRecordedUrl ||
          url.includes('/connect/authorize/callback')
        ) {
          console.log(`⏭️ Navigate ignorado (ruído): ${url.substring(0, 80)}`);
          return;
        }
        
        // Extract base URL (without query params) for comparison
        const baseUrl = url.split('?')[0].split('#')[0];
        const lastBaseUrl = lastRecordedUrl.split('?')[0].split('#')[0];
        if (baseUrl === lastBaseUrl) {
          console.log(`⏭️ Navigate ignorado (mesma base URL): ${baseUrl}`);
          return;
        }

        lastRecordedUrl = url;
        recordingSession.step_count++;
        const step = {
          sessao_id: recordingSession.sessao_id,
          nome_fluxo: recordingSession.nome_fluxo,
          passo_numero: recordingSession.step_count,
          acao: 'navigate',
          seletor: null,
          valor: url,
          url_pagina: url,
          descricao_tela: `Navegou para ${url.split('?')[0]}`,
        };
        fetch(`${recordingSession.supabase_url}/rest/v1/cobmais_conhecimento`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': recordingSession.supabase_key,
            'Authorization': `Bearer ${recordingSession.supabase_key}`,
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify(step),
        }).catch(() => {});
        console.log(`📝 Passo ${recordingSession.step_count} gravado: [navigate] ${url.split('?')[0]}`);
      }
    });

    console.log(`🎓 Gravação iniciada: "${nome_fluxo}" (sessão: ${sessao_id})`);
    updateStatus('recording', `Gravando: ${nome_fluxo}`);

    res.json({ success: true, message: `Gravação iniciada: ${nome_fluxo}` });
  } catch (err) {
    console.error('Erro ao iniciar gravação:', err.message);
    res.json({ success: false, error: err.message });
  }
});

// ===== ENDPOINT: PARAR GRAVAÇÃO =====
app.post('/automacao/parar-gravacao', async (req, res) => {
  if (!recording) {
    return res.json({ success: false, error: 'Nenhuma gravação ativa' });
  }

  const totalSteps = recordingSession?.step_count || 0;
  const flowName = recordingSession?.nome_fluxo || 'desconhecido';

  recording = false;
  recordingSession = null;

  // Remove recording script from page
  try {
    const pg = await initBrowser();
    await pg.evaluate(() => {
      window.__recordingActive = false;
    });
  } catch {}

  console.log(`🎓 Gravação finalizada: "${flowName}" com ${totalSteps} passos`);
  updateStatus('idle', 'Gravação finalizada');

  res.json({ success: true, total_passos: totalSteps, nome_fluxo: flowName });
});

// ===== ENDPOINT: EXTRAIR PÓS ATENDIMENTO =====
app.post('/automacao/extrair-pos-atendimento', async (req, res) => {
  try {
    const pg = await initBrowser();
    updateStatus('executando', 'Extraindo dados do Pós Atendimento...');

    const texto = await pg.evaluate(() => {
      // Try multiple selectors for the pos-atendimento panel
      const selectors = [
        '#pos-atendimento-content',
        '.pos-atendimento-content',
        '#divPosAtendimento',
        '.discagem-log',
        '#pos_atendimento',
        '#divDiscagem',
        '[id*="posAtendimento"]',
        '[id*="pos-atendimento"]',
        '[class*="pos-atendimento"]',
        '[class*="posAtendimento"]',
      ];
      
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent && el.textContent.trim().length > 10) {
          return el.textContent.trim();
        }
      }

      // Fallback: look for text patterns matching call logs
      const allElements = document.querySelectorAll('div, pre, textarea, span');
      for (const el of allElements) {
        const text = el.textContent || '';
        if (text.includes('Chamada Desligada') || text.includes('Cliente:') || text.includes('CPF/CNPJ:') || text.includes('Número discado:')) {
          return text.trim();
        }
      }

      // Last fallback: try iframes
      const iframes = document.querySelectorAll('iframe');
      for (const iframe of iframes) {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc) {
            const iframeText = iframeDoc.body?.textContent || '';
            if (iframeText.includes('Chamada Desligada') || iframeText.includes('Cliente:')) {
              return iframeText.trim();
            }
          }
        } catch (e) {
          // Cross-origin iframe, skip
        }
      }

      return null;
    });

    if (!texto) {
      updateStatus('idle', 'Painel Pós Atendimento não encontrado');
      return res.json({ success: false, error: 'Painel "Pós Atendimento" não encontrado. Verifique se a aba está aberta no CobMais.' });
    }

    updateStatus('idle', 'Dados do Pós Atendimento extraídos');
    console.log(`✅ Texto extraído do Pós Atendimento (${texto.length} chars)`);
    res.json({ success: true, texto });
  } catch (err) {
    console.error('❌ Erro ao extrair Pós Atendimento:', err.message);
    updateStatus('idle', 'Erro ao extrair Pós Atendimento');
    res.json({ success: false, error: err.message });
  }
});

// ===== INICIAR SERVIDOR =====
app.listen(PORT, async () => {
  console.log(`\n🤖 Servidor Playwright rodando na porta ${PORT}`);
  console.log(`📡 Configure o ngrok: ngrok http ${PORT}\n`);

  try {
    await initBrowser();
    updateStatus('idle', 'Pronto para automação');
  } catch (err) {
    console.error('Erro ao iniciar navegador:', err.message);
  }
});

// Cleanup ao fechar
process.on('SIGINT', async () => {
  console.log('\n🛑 Fechando navegador...');
  if (browser) await browser.close();
  process.exit();
});
