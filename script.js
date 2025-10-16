// =======================================================
// VARIAVEIS GLOBAIS
// =======================================================

let TODAS_ESTACOES = [];    // Armazena todos os dados do JSON.
let ESTACAO_SECRETA = null; // Armazena a estação que o jogador deve adivinhar.
let JOGADAS_FEITAS = [];    // Armazena o histórico de palpites do jogador.
const MAX_TENTATIVAS = 6;   // Define o limite de palpites (padrão Wordle/Metrodle).

// =======================================================
// FUNÇÕES DE INICIALIZAÇÃO
// =======================================================

/**
 * Carrega o arquivo JSON, processa os dados e inicializa o jogo.
 */
async function carregarDados() {
    try {
        // ATENÇÃO: Verifique a capitalização exata do nome do arquivo no seu repositório
        const response = await fetch('EstTubo_Curitiba_limpo.json'); 
        
        if (!response.ok) {
            console.error(`Erro ao carregar o JSON (HTTP Status ${response.status}).`);
            throw new Error(`Arquivo JSON não encontrado ou erro de status. Status: ${response.status}`);
        }
        
        let dadosRaw = await response.json();
        
        // --- PROCESSAMENTO E NORMALIZAÇÃO DOS DADOS ---
        TODAS_ESTACOES = dadosRaw.map(estacao => {
            
            // 1. Corrige Latitude e Longitude (Troca vírgula por ponto e converte para número)
            const latString = estacao.Latitude.replace(',', '.');
            const lonString = estacao.Longitude.replace(',', '.');
            const lat = parseFloat(latString);
            const lon = parseFloat(lonString);
            
            // 2. Corrige o campo "Linha" (Splita a string e limpa espaços)
            const linhasString = estacao.Linha || ''; // Garante que é uma string vazia se for null/undefined
            // Transforma "303, 304" em ["303", "304"]
            const linhasArray = linhasString.split(',').map(l => l.trim()).filter(l => l !== '');
            
            // 3. Cria o campo NomesLinhas para exibição (usando o mapa de tradução)
            const nomesLinhas = linhasArray.map(cod => MAPA_LINHAS[cod] || 'Ligeirinho');

            // Retorna o objeto padronizado
            return {
                ...estacao,
                Nome: estacao['Estação '].trim(), // Padroniza o nome (e remove espaços extras)
                Latitude: lat,
                Longitude: lon,
                Linhas: linhasArray,     // Novo campo padronizado (Array de códigos)
                NomesLinhas: nomesLinhas // Novo campo para feedback visual
            };
        });

        // 4. Inicializa o Jogo
        selecionarEstacaoSecreta(); 
        inicializarMapaPrevia(); 
        configurarInput();
        
        // Se deu certo, remove a mensagem de erro
        document.getElementById('game-status').innerText = "Que estação-tubo de Curitiba é essa?";

    } catch (error) {
        console.error("Falha fatal ao inicializar o jogo:", error);
        document.getElementById('game-status').innerText = "Erro ao carregar dados. Verifique o console do navegador.";
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
    'C01': 'Expresso Pinhais / Rui Barbosa', // Simplificado

    // Ligeirão
    '250': 'Ligeirão Norte / Sul',
    '500': 'Ligeirão Boqueirão',
    '550': 'Ligeirão Pinheirinho / Carlos Gomes',

    // Inter 2
    '022/023': 'Inter 2'
    // Outros são considerados 'Ligeirinhos' (pode ser o valor padrão se a chave não existir)
};

/**
 * Seleciona a estação secreta do dia usando a data como semente
 * para garantir que seja a mesma para todos no mesmo dia.
 */
function selecionarEstacaoSecreta() {
    let poolDeSelecao = [];

    // 1. Cria a pool de seleção com peso (5 - Prioridade)
    TODAS_ESTACOES.forEach(estacao => {
        // Prioridade 1 (máxima) -> Peso 4
        const peso = 5 - estacao.Prioridade;
        
        for (let i = 0; i < peso; i++) {
            poolDeSelecao.push(estacao);
        }
    });

    // 2. Lógica para criar uma "semente" baseada na data (DDMMAA)
    const hoje = new Date();
    // Usa uma fórmula simples para criar um número fixo por dia
    const semente = hoje.getFullYear() * 10000 + (hoje.getMonth() + 1) * 100 + hoje.getDate();
    
    // 3. Usa a semente para calcular um índice fixo na pool "pesada"
    const indiceFixo = semente % poolDeSelecao.length;
    ESTACAO_SECRETA = poolDeSelecao[indiceFixo];

    // Adiciona uma propriedade com os nomes das linhas para facilitar o feedback
    ESTACAO_SECRETA.NomesLinhas = ESTACAO_SECRETA.Linhas.map(cod => MAPA_LINHAS[cod] || 'Ligeirinho');

    console.log(`Estação Secreta de Hoje: ${ESTACAO_SECRETA.Nome} (Prioridade: ${ESTACAO_SECRETA.Prioridade})`);
    console.log(`Linhas Secretas:`, ESTACAO_SECRETA.NomesLinhas);
}

// =======================================================
// FUNÇÕES DE CÁLCULO GEOGRÁFICO
// =======================================================

/**
 * Calcula a distância em quilômetros entre duas coordenadas
 * usando a Fórmula de Haversine.
 */
function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Raio da Terra em km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distância em km
}

/**
 * Calcula a direção cardeal (azimute) do ponto 1 para o ponto 2.
 */
function calcularDirecao(lat1, lon1, lat2, lon2) {
    // Converte de graus para radianos
    const lat1Rad = lat1 * (Math.PI / 180);
    const lon1Rad = lon1 * (Math.PI / 180);
    const lat2Rad = lat2 * (Math.PI / 180);
    const lon2Rad = lon2 * (Math.PI / 180);

    const dLon = lon2Rad - lon1Rad;

    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - 
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    
    let angulo = Math.atan2(y, x);
    angulo = angulo * (180 / Math.PI); // Converte para graus (0 a 360)
    if (angulo < 0) {
        angulo += 360;
    }

    // Traduz o ângulo para uma direção cardeal (N, NE, L, SE, S, SO, O, NO)
    const direcoes = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
    // Índice de setor (45 graus por setor)
    const indice = Math.floor((angulo + 22.5) / 45) % 8; 

    return direcoes[indice]; 
}

/**
 * Verifica se o palpite e a estação secreta compartilham alguma linha.
 */
function compararLinhas(linhasPalpite, linhasSecreta) {
    // linhasPalpite e linhasSecreta são arrays de códigos (ex: ['303', 'C01'])
    const secretaSet = new Set(linhasSecreta);

    // Itera sobre as linhas do palpite para ver se alguma está na secreta
    return linhasPalpite.some(linha => secretaSet.has(linha));
}

// =======================================================
// FUNÇÃO PRINCIPAL DE INTERAÇÃO E GERAÇÃO DE PISTAS
// =======================================================

/**
 * Processa o palpite do jogador, calcula as pistas e atualiza a interface.
 */
function processarPalpite(nomePalpite) {
    // 1. Validar e Encontrar o Palpite
    const palpite = TODAS_ESTACOES.find(est => est.Nome.toUpperCase() === nomePalpite.toUpperCase());

    // Verifica se o jogo já terminou
    if (JOGADAS_FEITAS.length >= MAX_TENTATIVAS || ESTACAO_SECRETA.Acertou) {
        alert("O jogo acabou. Recarregue a página para jogar amanhã.");
        return;
    }

    if (!palpite) {
        alert("Estação não encontrada. Por favor, verifique a grafia exata.");
        return;
    }
    
    // Evita palpites repetidos (boa prática)
    if (JOGADAS_FEITAS.some(j => j.Nome === palpite.Nome)) {
         alert("Você já chutou esta estação.");
         return;
    }

    // 2. Calcular Pistas
    const distancia = calcularDistanciaKm(palpite.Latitude, palpite.Longitude, 
                                          ESTACAO_SECRETA.Latitude, ESTACAO_SECRETA.Longitude);

    const direcao = calcularDirecao(palpite.Latitude, palpite.Longitude, 
                                    ESTACAO_SECRETA.Latitude, ESTACAO_SECRETA.Longitude);

    const linhasEmComum = compararLinhas(palpite.Linhas, ESTACAO_SECRETA.Linhas);
    
    // 3. Gerar Feedback Visual (Classe e Ícone)
    
    // Pista de Distância (Cor de Proximidade)
    const feedbackDistancia = gerarFeedbackDistancia(distancia);

    // Pista de Direção (Seta)
    const feedbackDirecao = gerarFeedbackDirecao(direcao);

    // Pista de Linha (Cor ou Nome)
    const feedbackLinha = gerarFeedbackLinha(linhasEmComum, palpite);

    // 4. Registrar Jogada e Atualizar a Interface
    const jogada = {
        Nome: palpite.Nome,
        Distancia: distancia,
        Direcao: direcao,
        LinhasComum: linhasEmComum,
        FeedbackDistancia: feedbackDistancia,
        FeedbackDirecao: feedbackDirecao,
        FeedbackLinha: feedbackLinha
    };
    JOGADAS_FEITAS.push(jogada);

    // Esta função precisará ser implementada na integração com HTML
    adicionarLinhaNaGrade(jogada); 
    
    // 5. Verificar Vitória e Fim de Jogo
    if (distancia < 0.1) { // Acerto (menos de 100m)
        alert(`Parabéns! Você acertou a estação: ${ESTACAO_SECRETA.Nome}!`);
        ESTACAO_SECRETA.Acertou = true;
        mostrarFimDeJogo(true);
    } else if (JOGADAS_FEITAS.length >= MAX_TENTATIVAS) {
        alert(`Fim de Jogo! A estação secreta era: ${ESTACAO_SECRETA.Nome}.`);
        mostrarFimDeJogo(false);
    }
}


// =======================================================
// FUNÇÕES AUXILIARES DE FEEDBACK
// =======================================================

/**
 * Mapeia a distância calculada para uma classe CSS e um valor de exibição.
 */
function gerarFeedbackDistancia(distancia) {
    let classe;
    let valorExibido;

    if (distancia < 0.1) { // 100 metros: Vitória/Acerto
        classe = 'acerto-verde';
        valorExibido = '0 km';
    } else if (distancia <= 0.5) { // menos de 500m: VERDE-CLARO (Muito Quente)
        classe = 'acerto-quase-la';
    } else if (distancia <= 2.0) { // menos de 2 km: AMARELO (Quente)
        classe = 'acerto-amarelo';
    } else if (distancia <= 5.0) { // menos de 5 km: LARANJA (Morno)
        classe = 'acerto-laranja';
    } else { // mais de 5 km: CINZA (Frio)
        classe = 'acerto-cinza';
    }

    // Formata a distância para exibição (se não for acerto)
    if (distancia >= 0.1) {
        valorExibido = distancia.toFixed(2) + ' km';
    }
    
    return { classe, valorExibido };
}

/**
 * Traduz a direção cardeal (N, NE, etc.) para um ícone de seta.
 */
function gerarFeedbackDirecao(direcao) {
    // Use ícones unicode de seta ou classes CSS para setas estilizadas.
    // Exemplo com Unicode:
    const iconesSeta = {
        'N': '↑', 'NE': '↗', 'L': '→', 'SE': '↘',
        'S': '↓', 'SO': '↙', 'O': '←', 'NO': '↖'
    };
    // A classe pode ser usada para estilizar a cor do ícone
    return { 
        icone: iconesSeta[direcao], 
        classe: 'acerto-direcao' 
    };
}

/**
 * Gera o feedback de linhas, que pode ser o nome da linha ou uma cor.
 */
function gerarFeedbackLinha(linhasEmComum, palpite) {
    let classe;
    let valorExibido;
    
    if (linhasEmComum) {
        classe = 'acerto-linha'; // Amarelo/Dourado para linha em comum
        
        // Exibe o nome da linha de maior prioridade em comum, ou apenas 'Sim'
        // Simplificação: apenas mostra as linhas do palpite
        valorExibido = 'Linha Comum!'; 
        
        // Se você quiser mostrar o nome:
        const linhasDoPalpite = palpite.Linhas.map(cod => MAPA_LINHAS[cod] || 'Ligeirinho');
        valorExibido = linhasDoPalpite.join(', '); // Mostra as linhas que passam ali
        
    } else {
        classe = 'erro-linha'; // Cinza
        valorExibido = 'Nenhuma Linha';
    }
    
    return { classe, valorExibido };
}

// ... (Seu código existente: Variáveis Globais, carregarDados, selecionarEstacaoSecreta, etc.) ...

// Variável para a instância do mapa Leaflet
let mapa = null;
let marcadorSecreto = null; // Para mostrar a estação no fim do jogo

/**
 * Inicializa o mapa, centralizando em um ponto aleatório próximo à estação secreta
 * e esconde a localização exata, como uma prévia.
 */
function inicializarMapaPrevia() {
    const lat = ESTACAO_SECRETA.Latitude;
    const lon = ESTACAO_SECRETA.Longitude;
    
    // Centraliza o mapa em um ponto próximo (simulando um zoom nos arredores)
    // Exemplo: 0.005 graus de offset = ~500 metros
    const latCentral = lat + (Math.random() - 0.5) * 0.008; 
    const lonCentral = lon + (Math.random() - 0.5) * 0.008;

    // Configuração do mapa Leaflet
    mapa = L.map('mapa-previa').setView([latCentral, lonCentral], 16); // Nível de zoom 16 é bom para rua

    // Adiciona o tile layer (Camada de Mapa) do OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(mapa);
    
    // Adiciona um ponto CÍNZA (como o Metrodle) no centro da TELA, não na coordenada,
    // para simular a localização aproximada.
    L.circleMarker([latCentral, lonCentral], { 
        radius: 8, 
        color: '#555', 
        fillColor: '#555', 
        fillOpacity: 1 
    }).addTo(mapa);

    // Adiciona o autocomplete e eventos após o mapa
    configurarInput();
}


/**
 * Popula a lista de sugestões de Autocomplete e configura o evento "Chutar".
 */
function configurarInput() {
    const dataList = document.getElementById('estacoes-lista');
    const input = document.getElementById('palpite-input');
    const chutarBtn = document.getElementById('chutar-btn');
    
    // 1. Popula o Autocomplete
    TODAS_ESTACOES.forEach(estacao => {
        const option = document.createElement('option');
        option.value = estacao.Nome;
        dataList.appendChild(option);
    });

    // 2. Configura o botão "Chutar"
    chutarBtn.addEventListener('click', () => {
        const nomePalpite = input.value;
        processarPalpite(nomePalpite);
        input.value = ''; // Limpa o input
    });
    
    // 3. Permite chutar com a tecla ENTER
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            chutarBtn.click();
        }
    });
}

/**
 * Adiciona uma nova linha de palpite na grade do jogo.
 */
function adicionarLinhaNaGrade(jogada) {
    const grade = document.getElementById('grade-palpites');

    const linhaDiv = document.createElement('div');
    linhaDiv.classList.add('palpite-linha');

    // 1. Estação Chutada
    const nomeSpan = document.createElement('span');
    nomeSpan.innerText = jogada.Nome;
    linhaDiv.appendChild(nomeSpan);

    // 2. Distância
    const distanciaSpan = document.createElement('span');
    distanciaSpan.innerText = jogada.FeedbackDistancia.valorExibido;
    distanciaSpan.classList.add(jogada.FeedbackDistancia.classe);
    linhaDiv.appendChild(distanciaSpan);

    // 3. Direção
    const direcaoSpan = document.createElement('span');
    direcaoSpan.innerText = jogada.FeedbackDirecao.icone;
    direcaoSpan.classList.add(jogada.FeedbackDirecao.classe);
    linhaDiv.appendChild(direcaoSpan);

    // 4. Linha Comum
    const linhaSpan = document.createElement('span');
    linhaSpan.innerText = jogada.FeedbackLinha.valorExibido;
    linhaSpan.classList.add(jogada.FeedbackLinha.classe);
    linhaDiv.appendChild(linhaSpan);

    // Insere a nova linha no topo da grade (opcional: ou no final)
    // Vamos inserir no final da grade, após o cabeçalho.
    grade.appendChild(linhaDiv);
}

/**
 * Lógica para mostrar o resultado final do jogo (Vitória ou Derrota).
 */
function mostrarFimDeJogo(venceu) {
    // Bloqueia a entrada de novos palpites
    document.getElementById('palpite-input').disabled = true;
    document.getElementById('chutar-btn').disabled = true;

    // Remove o ponto falso do centro
    mapa.eachLayer(layer => {
        if (layer instanceof L.CircleMarker) {
            mapa.removeLayer(layer);
        }
    });

    // Revela a localização exata da estação secreta no mapa
    marcadorSecreto = L.circleMarker([ESTACAO_SECRETA.Latitude, ESTACAO_SECRETA.Longitude], {
        radius: 10,
        color: venceu ? '#2ecc71' : '#e74c3c', // Verde se venceu, Vermelho se perdeu
        fillColor: venceu ? '#2ecc71' : '#e74c3c',
        fillOpacity: 1
    }).addTo(mapa);
    
    marcadorSecreto.bindPopup(`Estação Secreta: <b>${ESTACAO_SECRETA.Nome}</b>`).openPopup();
    
    // Ajusta o mapa para mostrar a localização real, se for o caso
    if (!venceu) {
        mapa.setView([ESTACAO_SECRETA.Latitude, ESTACAO_SECRETA.Longitude], 16);
    }
    
    document.getElementById('game-status').innerText = venceu 
        ? `🎉 Acertou em ${JOGADAS_FEITAS.length} jogadas! A estação era ${ESTACAO_SECRETA.Nome}.`
        : `😔 Você perdeu! A estação era ${ESTACAO_SECRETA.Nome}.`;

    // Implemente aqui a lógica para mostrar estatísticas/compartilhar
}

// =======================================================
// INICIALIZAÇÃO DO JOGO
// =======================================================

function inicializarAposCarregamento() {
    // Adiciona um atraso de 100ms para garantir que bibliotecas externas (Leaflet)
    // tenham tido tempo de definir suas variáveis globais (L).
    setTimeout(() => {
        carregarDados();
    }, 500); 
}

// Garante que o código só é executado após o DOM e todas as dependências (Leaflet)
// estarem carregadas.
document.addEventListener('DOMContentLoaded', inicializarAposCarregamento);

