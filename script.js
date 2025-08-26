// Utilitário para parsear CSV simples
function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    // Remove prefixo N| do header e das linhas
    let header = lines[0].replace(/^\d+\|/, '').split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/g).map(h => h.replace(/(^\"|\"$)/g, '').trim());
    // Padroniza header removendo espaços extras
    header = header.map(h => h.trim());
    return lines.slice(1).map(line => {
        const cleanLine = line.replace(/^\d+\|/, '');
        // Split robusto: separa apenas vírgulas fora de aspas
        const parts = [];
        let current = '', inQuotes = false;
        for (let i = 0; i < cleanLine.length; i++) {
            const char = cleanLine[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                parts.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        parts.push(current);
        // Remove aspas e espaços extras
        return header.reduce((obj, key, i) => {
            obj[key] = (parts[i] || '').replace(/(^\"|\"$)/g, '').trim();
            return obj;
        }, {});
    });
}

// Função para buscar e processar o CSV
async function loadSurveyData() {
    const loading = document.getElementById('loadingIndicator');
    const dashboard = document.getElementById('dashboardContent');
    loading.style.display = 'flex';
    dashboard.style.opacity = 0;
    try {
        const resp = await fetch('survey.csv');
        if (!resp.ok) throw new Error(`Erro HTTP ${resp.status}: ${resp.statusText}`);
        const text = await resp.text();
        const data = parseCSV(text);
        renderDashboard(data);
        loading.style.display = 'none';
        dashboard.style.opacity = 1;
    } catch (e) {
        loading.innerHTML = `<span style='color: #e53e3e; font-weight: bold;'>Erro ao carregar dados:<br>${e.message || e}</span>`;
    }
}

// Funções auxiliares para análise dos dados
function getNumber(val) {
    if (!val) return null;
    // Extrai o primeiro número encontrado (idade pode ser '31 anos', '55', etc)
    const match = String(val).match(/\d{1,3}/);
    return match ? parseInt(match[0]) : null;
}

function getDate(val) {
    // Ex: 2025/08/04 10:02:03 da manhã GMT-3
    const match = val.match(/(\d{4}\/\d{2}\/\d{2})/);
    return match ? new Date(match[1]) : null;
}

// Renderização principal do dashboard
function renderDashboard(data) {
    // Estatísticas gerais
    document.getElementById('totalResponses').textContent = data.length;
    // Nota média experiência UBS
    const ratings = data.map(d => getNumber(d['3. Em uma escala de 1 a 5, como você avaliaria sua experiência na UBS? ( 1 = Muito ruim | 5 = Excelente )'])).filter(n => n >= 1 && n <= 5);
    const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2) : '0';
    document.getElementById('avgRating').textContent = avgRating;
    // Taxa de satisfação (nota 4 ou 5)
    const satisfied = ratings.filter(n => n >= 4).length;
    const satisfactionRate = ratings.length ? Math.round(100 * satisfied / ratings.length) : 0;
    document.getElementById('satisfactionRate').textContent = satisfactionRate + '%';
    // Nota média horário corrido
    const scheduleRatings = data.map(d => getNumber(d['5. Em uma escala de 1 a 5, como você avalia a experiência com o horário corrido?  ( 1 = Muito ruim | 5 = Excelente )'])).filter(n => n >= 1 && n <= 5);
    const avgSchedule = scheduleRatings.length ? (scheduleRatings.reduce((a, b) => a + b, 0) / scheduleRatings.length).toFixed(2) : '0';
    document.getElementById('avgScheduleRating').textContent = avgSchedule;

    // Período da pesquisa
    const dates = data.map(d => getDate(d['Carimbo de data/hora'])).filter(Boolean).sort((a, b) => a - b);
    if (dates.length) {
        const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
        document.getElementById('periodInfo').textContent = dates[0].toLocaleDateString('pt-BR', options) + ' a ' + dates[dates.length - 1].toLocaleDateString('pt-BR', options);
        document.getElementById('periodDetail').textContent = `${dates.length} dias de respostas`;
    }

    // Análise etária
    const ages = data.map(d => getNumber(d['2. Qual sua idade?'])).filter(Number.isFinite);
    if (ages.length) {
        const min = Math.min(...ages), max = Math.max(...ages), avg = (ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1);
        document.getElementById('ageInfo').textContent = `Média: ${avg} | Mín: ${min} | Máx: ${max}`;
        renderAgeDistribution(ages);
    }

    // Expectativas atendidas
    const expectations = data.map(d => (d['4. O atendimento que você recebeu atendeu às suas expectativas? '] || '').toLowerCase());
    const yes = expectations.filter(e => e === 'sim').length;
    const partial = expectations.filter(e => e.includes('parcial')).length;
    const no = expectations.filter(e => e === 'não').length;
    document.getElementById('expectationsInfo').textContent = `Sim: ${yes} | Parcial: ${partial} | Não: ${no}`;
    renderExpectationsChart(yes, partial, no);

    // Gráficos de notas
    renderBarChart('ubsChart', ratings);
    renderBarChart('scheduleChart', scheduleRatings);

    // Tabela de respostas
    setupTable(data);

    // Análise de comentários
    renderFeedbackAnalysis(data);

    // Insights automáticos
    renderInsights(data, avgRating, satisfactionRate, avgSchedule, yes, partial, no);
}

function renderAgeDistribution(ages) {
    const dist = {};
    ages.forEach(age => {
        const faixa = age < 20 ? '-19' : age < 30 ? '20-29' : age < 40 ? '30-39' : age < 50 ? '40-49' : age < 60 ? '50-59' : '60+';
        dist[faixa] = (dist[faixa] || 0) + 1;
    });
    const container = document.getElementById('ageDistribution');
    container.innerHTML = '';
    Object.entries(dist).forEach(([faixa, count]) => {
        const badge = document.createElement('span');
        badge.className = 'age-badge';
        badge.textContent = `${faixa}: ${count}`;
        container.appendChild(badge);
    });
}

function renderExpectationsChart(yes, partial, no) {
    const total = yes + partial + no;
    const chart = document.getElementById('expectationsChart');
    chart.innerHTML = '';
    [['yes', yes], ['partial', partial], ['no', no]].forEach(([cls, val]) => {
        const bar = document.createElement('div');
        bar.className = 'expectation-bar';
        const fill = document.createElement('div');
        fill.className = 'expectation-fill ' + cls;
        fill.style.width = total ? (100 * val / total) + '%' : '0%';
        bar.appendChild(fill);
        chart.appendChild(bar);
    });
}

function renderBarChart(containerId, values) {
    const counts = [1,2,3,4,5].map(n => values.filter(v => v === n).length);
    const max = Math.max(...counts, 1);
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    counts.forEach((count, i) => {
        const bar = document.createElement('div');
        bar.className = 'chart-bar score-' + (i+1);
        bar.style.height = (180 * count / max) + 'px';
        bar.title = `Nota ${i+1}: ${count}`;
        const val = document.createElement('span');
        val.className = 'chart-bar-value';
        val.textContent = count;
        bar.appendChild(val);
        container.appendChild(bar);
    });
}

// Tabela de respostas com busca, filtro e paginação
let tableData = [], currentPage = 1, rowsPerPage = 10, currentSearch = '', currentFilter = '';
// Ordem e nomes amigáveis das colunas (sem espaços extras nas chaves)
const tableColumns = [
    { key: 'Carimbo de data/hora', label: 'Data' },
    { key: '1. Qual seu nome?', label: 'Nome' },
    { key: '2. Qual sua idade?', label: 'Idade' },
    { key: '3. Em uma escala de 1 a 5, como você avaliaria sua experiência na UBS? ( 1 = Muito ruim | 5 = Excelente )', label: 'Nota Experiência UBS' },
    { key: '4. O atendimento que você recebeu atendeu às suas expectativas?', label: 'Expectativas Atendidas' },
    { key: '5. Em uma escala de 1 a 5, como você avalia a experiência com o horário corrido?  ( 1 = Muito ruim | 5 = Excelente )', label: 'Nota Horário Corrido' },
    { key: '6. O que poderiamos melhorar? Resposta aberta:', label: 'Sugestão/Melhoria' }
];

function setupTable(data) {
    tableData = data;
    currentPage = 1;
    renderTableHeader();
    document.getElementById('searchInput').addEventListener('input', e => {
        currentSearch = e.target.value.toLowerCase();
        currentPage = 1;
        renderTable();
    });
    document.getElementById('filterRating').addEventListener('change', e => {
        currentFilter = e.target.value;
        currentPage = 1;
        renderTable();
    });
    renderTable();
}

function renderTableHeader() {
    const thead = document.querySelector('#responsesTable').parentElement.querySelector('thead tr');
    thead.innerHTML = '';
    tableColumns.forEach((col, idx) => {
        const th = document.createElement('th');
        th.textContent = col.label;
        th.onclick = () => sortTable(idx);
        thead.appendChild(th);
    });
}

function renderTable() {
    let filtered = tableData.filter(row => {
        const rating = row[tableColumns[3].key];
        if (currentFilter && rating !== currentFilter) return false;
        if (currentSearch) {
            return tableColumns.some(col => (row[col.key] || '').toLowerCase().includes(currentSearch));
        }
        return true;
    });
    const total = filtered.length;
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const pageRows = filtered.slice(start, end);
    const tbody = document.getElementById('responsesTable');
    tbody.innerHTML = '';
    pageRows.forEach(row => {
        const tr = document.createElement('tr');
        tableColumns.forEach(col => {
            // Busca por chave exata, se não achar tenta com espaço no final (retrocompatibilidade)
            let val = row[col.key];
            if (val === undefined && col.key.endsWith('?')) {
                val = row[col.key + ' '];
            }
            const td = document.createElement('td');
            td.textContent = val || '';
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    // Paginação
    renderPagination(total);
    document.getElementById('tableInfo').textContent = `Mostrando ${Math.min(total, end)} de ${total} respostas`;
}

function renderPagination(total) {
    const pages = Math.ceil(total / rowsPerPage);
    const pag = document.getElementById('pagination');
    pag.innerHTML = '';
    for (let i = 1; i <= pages; i++) {
        const btn = document.createElement('button');
        btn.textContent = i;
        btn.className = (i === currentPage ? 'active' : '');
        btn.onclick = () => { currentPage = i; renderTable(); };
        pag.appendChild(btn);
    }
}

// Exportação CSV
window.exportToCSV = function() {
    let filtered = tableData.filter(row => {
        const rating = row['3. Em uma escala de 1 a 5, como você avaliaria sua experiência na UBS? ( 1 = Muito ruim | 5 = Excelente )'];
        if (currentFilter && rating !== currentFilter) return false;
        if (currentSearch) {
            return Object.values(row).some(val => (val || '').toLowerCase().includes(currentSearch));
        }
        return true;
    });
    if (!filtered.length) return;
    const header = Object.keys(filtered[0]);
    const csv = [header.join(',')].concat(filtered.map(row => header.map(k => '"' + (row[k] || '').replace(/"/g, '""') + '"').join(','))).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'respostas_filtradas.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

// Ordenação da tabela
window.sortTable = function(colIdx) {
    const key = tableColumns[colIdx].key;
    let asc = window._sortAsc = (window._sortKey === key ? !window._sortAsc : true);
    window._sortKey = key;
    tableData.sort((a, b) => {
        let va = a[key] || '', vb = b[key] || '';
        if (colIdx === 0) { // Data
            va = getDate(va) || new Date(0);
            vb = getDate(vb) || new Date(0);
            return asc ? va - vb : vb - va;
        }
        if (!isNaN(va) && !isNaN(vb)) return asc ? va - vb : vb - va;
        return asc ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    currentPage = 1;
    renderTable();
};

// Análise de comentários
function renderFeedbackAnalysis(data) {
    const comments = data.map(d => d['6. O que poderiamos melhorar? Resposta aberta:'].trim()).filter(Boolean);
    document.getElementById('totalComments').textContent = comments.length;
    // Comentários positivos (palavras-chave ou nota 5)
    const positive = data.filter(d => {
        const nota = parseInt(d['3. Em uma escala de 1 a 5, como você avaliaria sua experiência na UBS? ( 1 = Muito ruim | 5 = Excelente )']);
        const txt = (d['6. O que poderiamos melhorar? Resposta aberta:'] || '').toLowerCase();
        return nota === 5 && (txt.includes('ótimo') || txt.includes('excelente') || txt.includes('maravilhoso') || txt.includes('bom') || txt.includes('satisfeito'));
    });
    document.getElementById('positiveComments').textContent = positive.length;
    // Sugestões (palavras-chave ou nota < 5)
    const suggestions = data.filter(d => {
        const nota = parseInt(d['3. Em uma escala de 1 a 5, como você avaliaria sua experiência na UBS? ( 1 = Muito ruim | 5 = Excelente )']);
        const txt = (d['6. O que poderiamos melhorar? Resposta aberta:'] || '').toLowerCase();
        return nota < 5 || txt.length > 0;
    });
    document.getElementById('suggestionComments').textContent = suggestions.length;
    // Listar comentários por categoria
    renderFeedbackList('excellentFeedback', data.filter(d => parseInt(d['3. Em uma escala de 1 a 5, como você avaliaria sua experiência na UBS? ( 1 = Muito ruim | 5 = Excelente )']) === 5 && d['6. O que poderiamos melhorar? Resposta aberta:'].trim()));
    renderFeedbackList('goodFeedback', data.filter(d => parseInt(d['3. Em uma escala de 1 a 5, como você avaliaria sua experiência na UBS? ( 1 = Muito ruim | 5 = Excelente )']) === 4 && d['6. O que poderiamos melhorar? Resposta aberta:'].trim()));
    renderFeedbackList('suggestionsFeedback', suggestions.filter(d => d['6. O que poderiamos melhorar? Resposta aberta:'].trim()));
}

function renderFeedbackList(containerId, list) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    list.forEach(d => {
        const item = document.createElement('div');
        item.className = 'feedback-item';
        item.innerHTML = `<div class='feedback-text'>"${d['6. O que poderiamos melhorar? Resposta aberta:']}"</div><div class='feedback-meta'><span>${d['1. Qual seu nome?']}</span><span>${d['Carimbo de data/hora']}</span></div>`;
        container.appendChild(item);
    });
}

// Insights automáticos
function renderInsights(data, avgRating, satisfactionRate, avgSchedule, yes, partial, no) {
    const grid = document.getElementById('insightsGrid');
    grid.innerHTML = '';
    // Exemplos de insights
    const insights = [
        {
            title: 'Alta Satisfação Geral',
            content: `A nota média da experiência na UBS é <span class='insight-highlight'>${avgRating}</span> e <span class='insight-highlight'>${satisfactionRate}%</span> dos usuários deram nota 4 ou 5.`
        },
        {
            title: 'Horário Corrido Bem Avaliado',
            content: `A nota média para o horário corrido é <span class='insight-highlight'>${avgSchedule}</span>.` 
        },
        {
            title: 'Expectativas Atendidas',
            content: `<span class='insight-highlight'>${yes}</span> usuários disseram que suas expectativas foram atendidas, <span class='insight-highlight'>${partial}</span> parcialmente e <span class='insight-highlight'>${no}</span> não.`
        },
        {
            title: 'Sugestões de Melhoria',
            content: `Foram registradas <span class='insight-highlight'>${data.filter(d => d['6. O que poderiamos melhorar? Resposta aberta:'].trim()).length}</span> sugestões/comentários.`
        }
    ];
    insights.forEach(insight => {
        const card = document.createElement('div');
        card.className = 'insight-card';
        card.innerHTML = `<div class='insight-title'>${insight.title}</div><div class='insight-content'>${insight.content}</div>`;
        grid.appendChild(card);
    });
}

// Inicialização
window.addEventListener('DOMContentLoaded', loadSurveyData);
