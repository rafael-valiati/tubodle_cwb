// =======================================================
// VARIAVEIS GLOBAIS
// =======================================================

let TODAS_ESTACOES = [];    // Armazena todos os dados do JSON.
let ESTACAO_SECRETA = null; // Armazena a estação que o jogador deve adivinhar.
let JOGADAS_FEITAS = [];    // Armazena o histórico de palpites do jogador.
const MAX_TENTATIVAS = 6;   // Define o limite de palpites.

// =======================================================
// FUNÇÕES DE INICIALIZAÇÃO
// =======================================================

/**
 * Carrega o arquivo JSON, processa os dados e inicializa o jogo.
 */
async function carregarDados() {
    try {
        const response = await fetch('EstTubo_Curitiba_limpo.json'); 
        
        if (!response.ok) {
            console.error(`Erro ao carregar o JSON (HTTP Status ${response.status}).`);
            throw new Error(`Arquivo JSON não encontrado ou erro de status. Status: ${response.status}`);
        }
        
        let dadosRaw = await response.json();
        
        // --- PROCESSAMENTO E NORMALIZAÇÃO DOS DADOS ---
        TODAS_ESTACOES = dadosRaw.map(estacao => {
            const latString = String(estacao.Latitude).replace(',', '.');
            const lonString = String(estacao.Longitude).replace(',', '.');
            const lat = parseFloat(latString);
            const lon = parseFloat(lonString);
            
            const linhasString = estacao.Linha || '';
            const linhasArray = linhasString.split(',').map(l => l.trim()).filter(l => l !== '');
            
            return {
                ...estacao,
                Nome: estacao['Estação '].trim(),
                Latitude: lat,
                Longitude: lon,
                Linhas: linhasArray,
            };
        });

        // 4. Inicializa o Jogo
        selecionarEstacaoSecreta(); 
        inicializarMapaPrevia(); 
        configurarBotoesModal(); // NOVO: Configura o modal de regras
        
        document.getElementById('game-status').innerText = "Que estação-tubo de Curitiba é essa?";
        atualizarBarraProgresso(); // NOVO: Inicia a barra de progresso em 0

    } catch (error) {
        console.error("Falha fatal ao inicializar o jogo:", error);
        document.getElementById('game-status').innerText = "Erro ao carregar dados. Verifique o console.";
    }
}

// =======================================================
// MAPA DE LINHAS PARA TRADUÇÃO VISUAL
// =======================================================

const MAPA_LINHAS = {
    // Expresso
    '303': 'Expresso Centenário / Campo Comprido',
    '203': 'Expresso Santa Cândida / Capão Raso',
    '603': 'Expresso Pinheirinho / Rui Barbosa',
    '503': 'Expresso Boqueirão',
    '350': 'Expresso Atuba / Pinheirinho',
    '502/602': 'Expresso Circular Sul',
    'C01': 'Expresso Pinhais / Rui Barbosa',

    // Ligeirão
    '250': 'Ligeirão Norte / Sul',
    '500': 'Ligeirão Boqueirão',
    '550': 'Ligeirão Pinheirinho / Carlos Gomes',

    // Inter 2
    '022/023': 'Inter 2'
};

// --- 1. FUNÇÃO PRNG SIMPLES (NÃO MUDAR) ---
/**
 * Gera um número pseudo-aleatório entre 0 (inclusive) e 1 (exclusivo)
 * a partir de uma semente (seed) de entrada.
 * Fonte: Baseado em geradores PRNG simples.
 * @param {number} seed - O número inteiro que representa a semente (sua data).
 * @returns {number} Um número pseudo-aleatório entre 0 e 1.
 */
function seededRandom(seed) {
    // Usamos o módulo para garantir que o seed se ajuste bem ao cálculo.
    // Usar um primo grande ajuda a espalhar a distribuição.
    const m = 0x80000000; // 2^31
    const a = 1103515245;
    const c = 12345;
    
    // Atualiza o estado interno, mas no nosso caso, é o seed da função.
    // O JS usa 'bit-wise operations' para forçar o resultado a ser um inteiro de 32 bits,
    // o que é bom para a consistência do PRNG.
    seed = (a * seed + c) % m; 
    
    // Retorna o novo número normalizado entre 0 e 1.
    return seed / m;
}

// --- 2. FUNÇÃO ORIGINAL ATUALIZADA ---
function selecionarEstacaoSecreta() {
    let poolDeSelecao = [];
    TODAS_ESTACOES.forEach(estacao => {
        // A lógica de peso permanece a mesma
        const peso = 5 - estacao.Prioridade;
        for (let i = 0; i < peso; i++) {
            poolDeSelecao.push(estacao);
        }
    });

    const tamanhoPool = poolDeSelecao.length;
    
    // 1. Geração da Semente Diária (É fixa e sequencial, como antes)
    const hoje = new Date();
    const semente = hoje.getFullYear() * 10000 + (hoje.getMonth() + 1) * 100 + hoje.getDate();
    
    // 2. USO DO PRNG: Transforma a SEMENTE sequencial em um número pseudo-aleatório
    // Ex: 20251017 -> 0.7324...
    //     20251018 -> 0.1987... (totalmente diferente)
    const numeroPseudoAleatorio = seededRandom(semente);

    // 3. Calcula o Índice "Aleatório" (mas fixo para o dia)
    // Multiplica o número [0, 1) pelo tamanho do pool para ter um número [0, tamanhoPool)
    const indiceFixo = Math.floor(numeroPseudoAleatorio * tamanhoPool); 
    
    ESTACAO_SECRETA = poolDeSelecao[indiceFixo];

    console.log(`Estação Secreta de Hoje (Semente: ${semente}): ${ESTACAO_SECRETA.Nome}`);
}

// =======================================================
// FUNÇÕES DE CÁLCULO GEOGRÁFICO
// =======================================================

function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function calcularDirecao(lat1, lon1, lat2, lon2) {
    const lat1Rad = lat1 * (Math.PI / 180);
    const lon1Rad = lon1 * (Math.PI / 180);
    const lat2Rad = lat2 * (Math.PI / 180);
    const lon2Rad = lon2 * (Math.PI / 180);
    const dLon = lon2Rad - lon1Rad;
    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - 
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    let angulo = Math.atan2(y, x) * (180 / Math.PI);
    if (angulo < 0) angulo += 360;
    const direcoes = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
    const indice = Math.floor((angulo + 22.5) / 45) % 8; 
    return direcoes[indice]; 
}

// =======================================================
// FUNÇÃO PRINCIPAL DE INTERAÇÃO E GERAÇÃO DE PISTAS
// =======================================================

/**
 * Processa o palpite do jogador, calcula as pistas e atualiza a interface.
 */
function processarPalpite(nomePalpite) {
    // Verifica se o jogo já terminou
    if (JOGADAS_FEITAS.length >= MAX_TENTATIVAS || (JOGADAS_FEITAS.length > 0 && JOGADAS_FEITAS[JOGADAS_FEITAS.length - 1].Acertou)) {
        return;
    }

    const palpite = TODAS_ESTACOES.find(est => est.Nome.toUpperCase() === nomePalpite.toUpperCase());
    if (!palpite) {
        alert("Estação não encontrada. Por favor, verifique a grafia exata.");
        return;
    }
    if (JOGADAS_FEITAS.some(j => j.Nome === palpite.Nome)) {
        alert("Você já chutou esta estação.");
        return;
    }

    // 2. Calcular Pistas
    const distancia = calcularDistanciaKm(palpite.Latitude, palpite.Longitude, ESTACAO_SECRETA.Latitude, ESTACAO_SECRETA.Longitude);
    const acertou = distancia < 0.1; // Limite de 100m para considerar acerto

    // 3. Gerar Feedback Visual
    const feedbackDistancia = gerarFeedbackDistancia(distancia);
    const feedbackDirecao = gerarFeedbackDirecao(palpite, ESTACAO_SECRETA, acertou);
    const feedbackLinha = gerarFeedbackLinha(palpite, ESTACAO_SECRETA);

    // 4. Registrar Jogada
    const jogada = {
        Nome: palpite.Nome,
        Acertou: acertou,
        FeedbackDistancia: feedbackDistancia,
        FeedbackDirecao: feedbackDirecao,
        FeedbackLinha: feedbackLinha,
        // NOVO: Adiciona a flag se foi a última jogada
        UltimaJogada: JOGADAS_FEITAS.length + 1 === MAX_TENTATIVAS
    };
    JOGADAS_FEITAS.push(jogada);

    adicionarLinhaNaGrade(jogada);
    atualizarBarraProgresso();

    // 5. Verificar Fim de Jogo
    if (acertou) {
        mostrarFimDeJogo(true);
    } else if (JOGADAS_FEITAS.length >= MAX_TENTATIVAS) {
        mostrarFimDeJogo(false);
    }
}

// =======================================================
// FUNÇÕES AUXILIARES DE FEEDBACK (ATUALIZADAS!)
// =======================================================

/**
 * MUDANÇA 1: Novas cores de distância.
 * Mapeia a distância para uma classe CSS e um valor de exibição.
 */
function gerarFeedbackDistancia(distancia) {
    let classe;
    if (distancia < 0.1) {
        classe = 'distancia-verde'; // Acerto exato
    } else if (distancia <= 0.5) {
        classe = 'distancia-azul'; // < 0.5 km
    } else if (distancia <= 2.0) {
        classe = 'distancia-amarelo'; // 0.5 a 2 km
    } else if (distancia <= 5.0) {
        classe = 'distancia-laranja'; // 2 a 5 km
    } else {
        classe = 'distancia-cinza'; // > 5 km
    }
    const valorExibido = distancia < 0.1 ? '0 km' : `${distancia.toFixed(2)} km`;
    return { classe, valorExibido };
}

/**
 * MUDANÇA 2: Ícones e nomes de direção.
 * MUDANÇA 7: Emoji de vitória.
 * Gera o feedback de direção.
 */
function gerarFeedbackDirecao(palpite, secreta, acertou) {
    if (acertou) {
        return { icone: '🎉', texto: 'ACERTOU!', classe: 'feedback-vitoria' };
    }

    const direcao = calcularDirecao(palpite.Latitude, palpite.Longitude, secreta.Latitude, secreta.Longitude);
    
    const icones = { 'N': '⬆️', 'NE': '↗️', 'L': '➡️', 'SE': '↘️', 'S': '⬇️', 'SO': '↙️', 'O': '⬅️', 'NO': '↖️' };
    const nomes = { 'N': 'Norte', 'NE': 'Nordeste', 'L': 'Leste', 'SE': 'Sudeste', 'S': 'Sul', 'SO': 'Sudoeste', 'O': 'Oeste', 'NO': 'Noroeste' };

    return { 
        icone: icones[direcao],
        texto: nomes[direcao],
        classe: 'feedback-direcao' 
    };
}

/**
 * MUDANÇAS 4, 5, 6: Lógica de cores e texto para linhas.
 * Gera o feedback de linhas (Nenhuma, Parcial, Total).
 */
function gerarFeedbackLinha(palpite, secreta) {
    const palpiteLinhas = new Set(palpite.Linhas);
    const secretaLinhas = new Set(secreta.Linhas);
    const linhasEmComum = [...palpiteLinhas].filter(linha => secretaLinhas.has(linha));

    let classe;
    let valorExibido;

    if (linhasEmComum.length === 0) {
        classe = 'linha-nenhuma';
        valorExibido = 'Nenhuma';
    } else {
        // Verifica se é acerto total
        const isMatchTotal = palpiteLinhas.size === secretaLinhas.size && linhasEmComum.length === secretaLinhas.size;

        if (isMatchTotal) {
            // =======================================================
            // ALTERAÇÃO AQUI: Acerto total exibe "Todas as linhas"
            // =======================================================
            classe = 'linha-total'; // Todas as linhas batem
            valorExibido = 'Todas as linhas'; 

        } else {
            // Lógica para acerto parcial (original)
            const temLigeirinhoComum = linhasEmComum.some(cod => !MAPA_LINHAS.hasOwnProperty(cod));
            
            if (temLigeirinhoComum) {
                valorExibido = 'Algum Ligeirinho';
            } else {
                valorExibido = linhasEmComum.map(cod => MAPA_LINHAS[cod]).join(', ');
            }
            
            classe = 'linha-parcial'; // Apenas algumas linhas batem
        }
    }
    
    return { classe, valorExibido };
}

// =======================================================
// FUNÇÕES DE INTERFACE E MAPA (ATUALIZADAS!)
// =======================================================

let mapa = null;
let marcadorSecreto = null;

function inicializarMapaPrevia() {
    const lat = ESTACAO_SECRETA.Latitude;
    const lon = ESTACAO_SECRETA.Longitude;
    
    // Zoom aumentado para 17 (era 16).
    mapa = L.map('mapa-previa', {
        zoomControl: false, dragging: false, minZoom: 17, maxZoom: 17,
        scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false,
        keyboard: false, touchZoom: false
    }).setView([lat, lon], 17); // View setada em zoom 17

    // TileLayer: 'light_nolabels' (sem ruas/nomes) para telas maiores (Ponto 2)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png', {
        attribution: '©OpenStreetMap, ©CartoDB',
        maxZoom: 19
    }).addTo(mapa);
    
    L.circleMarker([lat, lon], { radius: 15, color: '#555', fillColor: '#555', fillOpacity: 1 }).addTo(mapa);
    mapa.invalidateSize(); 
    configurarInput();
}

/**
 * NOVO (Ponto 3): Configura a abertura e fechamento do Modal de Regras.
 */
function configurarBotoesModal() {
    const infoBtn = document.getElementById('info-btn');
    const fecharBtn = document.getElementById('close-modal-btn');
    const modal = document.getElementById('modal-overlay');

    if (infoBtn && fecharBtn && modal) {
        infoBtn.addEventListener('click', () => {
            modal.classList.remove('hidden');
        });

        fecharBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
        
        // Fechar se clicar fora do modal
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'modal-overlay') {
                modal.classList.add('hidden');
            }
        });
    } else {
        console.error("Um ou mais elementos do modal (botões ou overlay) não foram encontrados.");
    }
}

function configurarInput() {
    const dataList = document.getElementById('estacoes-lista');
    const input = document.getElementById('palpite-input');
    const chutarBtn = document.getElementById('chutar-btn');

    if (!chutarBtn) {
        console.error("ERRO GRAVE: Botão 'chutar-btn' não encontrado.");
        return; 
    }
    
    const nomesUnicos = new Set(TODAS_ESTACOES.map(est => est.Nome));
    dataList.innerHTML = ''; 
    nomesUnicos.forEach(nome => {
        const option = document.createElement('option');
        option.value = nome;
        dataList.appendChild(option);
    });
    
    const submeterPalpite = () => {
        const nomePalpite = input.value.trim(); 
        if (nomePalpite) {
            processarPalpite(nomePalpite);
            input.value = ''; 
        } else {
            alert("Por favor, digite o nome de uma estação.");
        }
    };

    chutarBtn.addEventListener('click', submeterPalpite);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); 
            submeterPalpite();
        }
    });
}

/**
 * ATUALIZADO: Renderiza a célula de direção com ícone e texto.
 * Adiciona uma nova linha de palpite na grade do jogo.
 */
/**
 * ATUALIZADO (Ponto 4): Adiciona classe 'palpite-derrota' no 6º palpite errado.
 * Adiciona uma nova linha de palpite na grade do jogo.
 */
function adicionarLinhaNaGrade(jogada) {
    const grade = document.getElementById('grade-palpites');
    const novaLinha = document.createElement('tr');
    
    if (jogada.Acertou) { 
        novaLinha.classList.add('palpite-correto');
    } 
    // NOVO: Adiciona classe de derrota se for o último palpite e estiver errado
    else if (jogada.UltimaJogada && !jogada.Acertou) {
        novaLinha.classList.add('palpite-derrota');
    }

    // ... (O resto da lógica para criar as células da tabela permanece igual)
    
    // Célula 1: Palpite
    const celulaPalpite = document.createElement('td');
    celulaPalpite.innerText = jogada.Nome;
    novaLinha.appendChild(celulaPalpite);

    // Célula 2: Distância
    const celulaDistancia = document.createElement('td');
    celulaDistancia.innerText = jogada.FeedbackDistancia.valorExibido;
    celulaDistancia.className = jogada.FeedbackDistancia.classe;
    novaLinha.appendChild(celulaDistancia);

    // Célula 3: Direção
    const celulaDirecao = document.createElement('td');
    celulaDirecao.className = jogada.FeedbackDirecao.classe;
    if (jogada.Acertou) {
        celulaDirecao.innerText = jogada.FeedbackDirecao.icone; // Apenas o emoji
    } else {
        celulaDirecao.innerHTML = `
            <div class="direcao-container">
                <span class="direcao-icone">${jogada.FeedbackDirecao.icone}</span>
                <span class="direcao-texto">${jogada.FeedbackDirecao.texto}</span>
            </div>
        `;
    }
    novaLinha.appendChild(celulaDirecao);

    // Célula 4: Linhas
    const celulaLinha = document.createElement('td');
    celulaLinha.innerText = jogada.FeedbackLinha.valorExibido;
    celulaLinha.className = jogada.FeedbackLinha.classe;
    novaLinha.appendChild(celulaLinha);

    grade.prepend(novaLinha);
}

/**
 * MUDANÇA 8: Nova função para a barra de progresso.
 */
function atualizarBarraProgresso() {
    const palpitesFeitos = JOGADAS_FEITAS.length;
    const textoProgresso = document.getElementById('progresso-texto');
    const barraProgresso = document.getElementById('progresso-palpites');
    
    if (textoProgresso && barraProgresso) {
        textoProgresso.innerText = `${palpitesFeitos} / ${MAX_TENTATIVAS}`;
        barraProgresso.value = palpitesFeitos;
    }
}

/**
 * ATUALIZADO: Mostra o resultado final sem usar `alert`.
 */
function mostrarFimDeJogo(venceu) {
    document.getElementById('palpite-input').disabled = true;
    document.getElementById('chutar-btn').disabled = true;

    mapa.eachLayer(layer => {
        if (layer instanceof L.CircleMarker) mapa.removeLayer(layer);
    });

    marcadorSecreto = L.circleMarker([ESTACAO_SECRETA.Latitude, ESTACAO_SECRETA.Longitude], {
        radius: 15,
        color: venceu ? '#4CAF50' : '#e74c3c',
        fillColor: venceu ? '#4CAF50' : '#e74c3c',
        fillOpacity: 1
    }).addTo(mapa);
    
    marcadorSecreto.bindPopup(`<b>${ESTACAO_SECRETA.Nome}</b>`).openPopup();
    
    mapa.setView([ESTACAO_SECRETA.Latitude, ESTACAO_SECRETA.Longitude], 16);
    
    document.getElementById('game-status').innerText = venceu 
        ? `🎉 Acertou em ${JOGADAS_FEITAS.length} jogadas! A estação era ${ESTACAO_SECRETA.Nome}.`
        : `😔 Fim de jogo! A estação era ${ESTACAO_SECRETA.Nome}.`;
}

// =======================================================
// INICIALIZAÇÃO DO JOGO
// =======================================================

document.addEventListener('DOMContentLoaded', carregarDados);
