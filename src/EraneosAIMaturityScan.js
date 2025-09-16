import React, { useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
} from 'chart.js';
import { Radar, Bar } from 'react-chartjs-2';

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement
);

const ERANEOS_COLORS = {
  brand: 'bg-[#0b6b9a]',
  accent: 'bg-[#ff7a00]'
};

const QUESTIONS = [
  {
    id: 'governance',
    title: 'Governance & Strategy',
    description: 'Leadership, strategy, policies, roles & KPIs for AI in HR (hiring, scheduling, performance).',
    items: [
      { id: 'g1', text: 'We have a written AI strategy that covers HR use-cases (hiring, scheduling, payroll)' },
      { id: 'g2', text: 'Defined ownership and decision rights for AI in HR (HR lead + IT/data owner)' },
      { id: 'g3', text: 'Policies exist for acceptable use, privacy, and audit of HR AI tools' }
    ]
  },
  {
    id: 'data',
    title: 'Data & Integration',
    description: 'Availability, quality, governance and integrations of HR & retail data (POS, ATS, payroll).',
    items: [
      { id: 'd1', text: 'HR systems (ATS, HRIS) data is available and integrated (skills, tenure, performance)' },
      { id: 'd2', text: 'Retail operational data (POS, schedules) is accessible for workforce planning' },
      { id: 'd3', text: 'Data quality checks and anonymization processes are in place' }
    ]
  },
  {
    id: 'people',
    title: 'People & Skills',
    description: 'AI literacy, training and change readiness in HR and store teams.',
    items: [
      { id: 'p1', text: 'HR staff have basic AI literacy and training programs exist' },
      { id: 'p2', text: 'Store managers are trained to interpret AI recommendations (scheduling, forecasts)' },
      { id: 'p3', text: 'Processes exist to escalate model concerns / false positives' }
    ]
  },
  {
    id: 'process',
    title: 'Processes & Use-cases',
    description: 'Documented processes and prioritized AI use-cases for HR in retail.',
    items: [
      { id: 'pr1', text: 'Use-cases like candidate screening, workforce forecasting, shift optimization are prioritized' },
      { id: 'pr2', text: 'End-to-end process maps exist (input -> model -> human decision -> audit)' },
      { id: 'pr3', text: 'SLA & KPI definitions exist for AI outputs used in HR decisions' }
    ]
  },
  {
    id: 'technology',
    title: 'Technology & Tools',
    description: 'Tooling, infra and vendor management (HRIS, cloud, LLMs).',
    items: [
      { id: 't1', text: 'Secure tooling and platform for AI experiments (sandboxed, versioned)' },
      { id: 't2', text: 'Integration with HRIS/ATS and identity providers is implemented' },
      { id: 't3', text: 'Vendor risk assessments and contracts address data handling' }
    ]
  },
  {
    id: 'ethics',
    title: 'Ethics, Compliance & Privacy',
    description: 'Bias mitigation, consent, GDPR, and HR-specific ethics (hiring fairness).',
    items: [
      { id: 'e1', text: 'Bias checks and fairness evaluation are part of the model lifecycle' },
      { id: 'e2', text: 'Consent, DPIA and record of processing are maintained for HR data' },
      { id: 'e3', text: 'Logging, explainability and appeals processes exist for automated decisions' }
    ]
  }
];

const MATURITY_LEVELS = [
  { level: 1, name: 'Initial', color: '#ef4444', description: 'Ad-hoc, reactive approach to AI in HR' },
  { level: 2, name: 'Developing', color: '#f97316', description: 'Basic processes and awareness emerging' },
  { level: 3, name: 'Defined', color: '#eab308', description: 'Documented processes and clear governance' },
  { level: 4, name: 'Managed', color: '#22c55e', description: 'Measured and controlled AI implementation' },
  { level: 5, name: 'Optimized', color: '#059669', description: 'Continuous improvement and innovation' }
];

export default function EraneosAIMaturityScan() {
  const initialAnswers = useMemo(() => {
    const map = {};
    QUESTIONS.forEach(cat => cat.items.forEach(q => (map[q.id] = 3)));
    return map;
  }, []);

  const [answers, setAnswers] = useState(initialAnswers);
  const [metadata, setMetadata] = useState({ organisation: '', contact: '', date: new Date().toISOString().slice(0,10) });
  const [submitted, setSubmitted] = useState(null);
  const [view, setView] = useState('form'); // form | dashboard | result

  const handleAnswer = (qid, val) => setAnswers(prev => ({ ...prev, [qid]: Number(val) }));

  const computeScores = () => {
    const catScores = QUESTIONS.map(cat => {
      const sum = cat.items.reduce((s, q) => s + (answers[q.id] || 0), 0);
      const avg = sum / cat.items.length;
      return { id: cat.id, title: cat.title, score: Number((avg).toFixed(2)) };
    });
    const overall = Number((catScores.reduce((s, c) => s + c.score, 0) / catScores.length).toFixed(2));
    return { categories: catScores, overall };
  };

  const scores = computeScores();
  const maturityLevel = Math.max(0, Math.min(4, Math.round(scores.overall) - 1));
  const maturity = MATURITY_LEVELS[maturityLevel] || MATURITY_LEVELS[0];

  const exportToCSV = () => {
    const rows = [];
    rows.push(['Category', 'Question', 'Answer']);
    QUESTIONS.forEach(cat => {
      cat.items.forEach(q => rows.push([cat.title, q.text, answers[q.id]]));
    });
    rows.push(['Metadata', 'Organisation', metadata.organisation]);
    rows.push(['Metadata', 'Contact', metadata.contact]);
    rows.push(['Metadata', 'Date', metadata.date]);
    rows.push(['Results', 'Overall Score', scores.overall]);
    rows.push(['Results', 'Maturity Level', maturity.name]);
    
    const csvContent = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eraneos-ai-scan-${metadata.organisation || 'anonymous'}-${metadata.date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const submit = async () => {
    const id = Date.now().toString();
    const payload = { id, metadata, answers, scores };
    setSubmitted({ id, payload, shareLink: `${window.location.origin}/scan/${id}` });
    setView('result');
  };

  // Enhanced Chart.js data preparation with better styling
  const radarData = {
    labels: scores.categories.map(c => c.title.replace(' & ', '\n& ')),
    datasets: [
      {
        label: 'Current Maturity',
        data: scores.categories.map(c => c.score),
        backgroundColor: 'rgba(11, 107, 154, 0.15)',
        borderColor: '#0b6b9a',
        borderWidth: 3,
        pointBackgroundColor: '#ff7a00',
        pointBorderColor: '#ff7a00',
        pointRadius: 6,
        pointHoverRadius: 8,
      },
      {
        label: 'Target (Level 4)',
        data: new Array(6).fill(4),
        backgroundColor: 'rgba(255, 122, 0, 0.1)',
        borderColor: '#ff7a00',
        borderWidth: 2,
        borderDash: [5, 5],
        pointBackgroundColor: 'transparent',
        pointBorderColor: 'transparent',
        pointRadius: 0,
      },
    ],
  };

  const radarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        beginAtZero: true,
        max: 5,
        min: 0,
        ticks: {
          stepSize: 1,
          font: { size: 12 },
          color: '#6b7280',
        },
        grid: {
          color: '#e5e7eb',
        },
        angleLines: {
          color: '#e5e7eb',
        },
        pointLabels: {
          font: { size: 11, weight: 'bold' },
          color: '#374151',
        },
      },
    },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          font: { size: 12 },
          padding: 20,
        },
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            return `${context.dataset.label}: ${context.parsed.r.toFixed(1)}`;
          }
        }
      },
    },
  };

  const barData = {
    labels: scores.categories.map(c => c.title.split(' ')[0]),
    datasets: [
      {
        label: 'Current Score',
        data: scores.categories.map(c => c.score),
        backgroundColor: scores.categories.map(c => {
          const level = Math.round(c.score) - 1;
          return MATURITY_LEVELS[Math.max(0, Math.min(4, level))].color + '80';
        }),
        borderColor: scores.categories.map(c => {
          const level = Math.round(c.score) - 1;
          return MATURITY_LEVELS[Math.max(0, Math.min(4, level))].color;
        }),
        borderWidth: 2,
        borderRadius: 4,
      },
    ],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        max: 5,
        ticks: {
          stepSize: 1,
          font: { size: 12 },
        },
        grid: {
          color: '#f3f4f6',
        },
      },
      x: {
        ticks: {
          font: { size: 11 },
        },
        grid: {
          display: false,
        },
      },
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const level = Math.round(context.parsed.y) - 1;
            const maturityName = MATURITY_LEVELS[Math.max(0, Math.min(4, level))].name;
            return `Score: ${context.parsed.y.toFixed(1)} (${maturityName})`;
          }
        }
      },
    },
  };

  // Progress indicators for each category
  const getProgressColor = (score) => {
    const level = Math.round(score) - 1;
    return MATURITY_LEVELS[Math.max(0, Math.min(4, level))].color;
  };

  return (
    <div className="p-6 max-w-6xl mx-auto bg-gray-50 min-h-screen">
      <header className="flex items-center justify-between mb-8 bg-white p-6 rounded-lg shadow-sm">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-xl ${ERANEOS_COLORS.brand}`}>E</div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Eraneos — AI Readiness & Maturity Scan</h1>
            <p className="text-gray-600">Tailored for HR in Retail — Comprehensive Assessment with Advanced Visualization</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-600 mb-1">Overall Maturity</div>
          <div 
            className="px-4 py-2 rounded-lg font-bold text-white text-lg shadow-md"
            style={{ backgroundColor: maturity.color }}
          >
            {maturity.name} ({scores.overall})
          </div>
          <div className="text-xs text-gray-500 mt-1">{maturity.description}</div>
        </div>
      </header>

      {view === 'form' && (
        <div className="space-y-6">
          <section className="bg-white p-6 rounded-lg shadow-sm">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">Assessment Information</h2>
            <div className="grid grid-cols-3 gap-4">
              <input 
                className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                placeholder="Organisation" 
                value={metadata.organisation} 
                onChange={e => setMetadata(s => ({ ...s, organisation: e.target.value }))} 
              />
              <input 
                className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                placeholder="Contact person / email" 
                value={metadata.contact} 
                onChange={e => setMetadata(s => ({ ...s, contact: e.target.value }))} 
              />
              <input 
                className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                type="date" 
                value={metadata.date} 
                onChange={e => setMetadata(s => ({ ...s, date: e.target.value }))} 
              />
            </div>
          </section>

          {QUESTIONS.map(cat => {
            const catScore = scores.categories.find(c => c.id === cat.id)?.score || 0;
            return (
              <div key={cat.id} className="bg-white p-6 rounded-lg shadow-sm border-l-4" style={{ borderLeftColor: getProgressColor(catScore) }}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">{cat.title}</h3>
                    <p className="text-gray-600 mt-1">{cat.description}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold" style={{ color: getProgressColor(catScore) }}>
                      {catScore.toFixed(1)}
                    </div>
                    <div className="text-xs text-gray-500">Category Score</div>
                  </div>
                </div>
                <div className="space-y-4">
                  {cat.items.map(q => (
                    <div key={q.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1 text-gray-800">{q.text}</div>
                      <div className="flex gap-2 items-center">
                        {[1,2,3,4,5].map(v => (
                          <label key={v} className={`p-3 rounded-lg cursor-pointer transition-all ${
                            answers[q.id]===v 
                              ? 'ring-2 ring-orange-400 bg-orange-100 text-orange-800 font-bold' 
                              : 'hover:bg-gray-200 bg-white border border-gray-300'
                          }`}>
                            <input 
                              type="radio" 
                              name={q.id} 
                              value={v} 
                              checked={answers[q.id]===v} 
                              onChange={() => handleAnswer(q.id, v)} 
                              className="hidden" 
                            />
                            <div className="text-sm font-medium">{v}</div>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="flex gap-4 justify-center bg-white p-6 rounded-lg shadow-sm">
            <button 
              onClick={exportToCSV} 
              className="px-6 py-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors font-medium"
            >
              📊 Export CSV
            </button>
            <button 
              onClick={() => setView('dashboard')} 
              className="px-6 py-3 rounded-lg text-white font-medium transition-colors hover:opacity-90" 
              style={{ backgroundColor: '#ff7a00' }}
            >
              📈 View Dashboard
            </button>
            <button 
              onClick={submit} 
              className="px-6 py-3 rounded-lg text-white font-medium transition-colors hover:opacity-90" 
              style={{ backgroundColor: '#0b6b9a' }}
            >
              🚀 Submit & Generate Report
            </button>
          </div>
        </div>
      )}

      {view === 'dashboard' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <h2 className="text-2xl font-bold mb-6 text-gray-900">AI Maturity Dashboard</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-gray-50 p-6 rounded-lg">
                <h4 className="text-lg font-semibold mb-4 text-gray-800">Maturity Radar Chart</h4>
                <div className="h-80">
                  <Radar data={radarData} options={radarOptions} />
                </div>
              </div>

              <div className="bg-gray-50 p-6 rounded-lg">
                <h4 className="text-lg font-semibold mb-4 text-gray-800">Category Scores</h4>
                <div className="h-80">
                  <Bar data={barData} options={barOptions} />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm">
            <h3 className="text-xl font-semibold mb-4 text-gray-900">Detailed Category Analysis</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {scores.categories.map(cat => {
                const level = Math.round(cat.score) - 1;
                const maturityInfo = MATURITY_LEVELS[Math.max(0, Math.min(4, level))];
                return (
                  <div key={cat.id} className="p-4 border rounded-lg bg-gray-50">
                    <h4 className="font-semibold text-gray-800">{cat.title}</h4>
                    <div className="mt-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-gray-600">Score</span>
                        <span className="font-bold" style={{ color: maturityInfo.color }}>
                          {cat.score.toFixed(1)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="h-2 rounded-full transition-all duration-500"
                          style={{ 
                            width: `${(cat.score / 5) * 100}%`,
                            backgroundColor: maturityInfo.color 
                          }}
                        ></div>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{maturityInfo.name}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-4 justify-center bg-white p-6 rounded-lg shadow-sm">
            <button 
              onClick={() => setView('form')} 
              className="px-6 py-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors font-medium"
            >
              ← Back to Assessment
            </button>
            <button 
              onClick={exportToCSV} 
              className="px-6 py-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors font-medium"
            >
              📊 Export Data
            </button>
          </div>
        </div>
      )}

      {view === 'result' && submitted && (
        <div className="bg-white p-8 rounded-lg shadow-sm">
          <h3 className="text-2xl font-bold mb-6 text-gray-900">Assessment Complete! 🎉</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="p-6 bg-gray-50 rounded-lg">
              <h4 className="font-semibold text-gray-800 mb-2">Overall Results</h4>
              <div className="text-3xl font-bold mb-2" style={{ color: maturity.color }}>
                {scores.overall} / 5.0
              </div>
              <div className="text-lg font-medium text-gray-700">{maturity.name} Level</div>
              <div className="text-sm text-gray-600 mt-1">{maturity.description}</div>
            </div>
            
            <div className="p-6 bg-gray-50 rounded-lg">
              <h4 className="font-semibold text-gray-800 mb-2">Assessment Details</h4>
              <div className="space-y-1 text-sm">
                <div><strong>Organisation:</strong> {metadata.organisation || 'Not specified'}</div>
                <div><strong>Contact:</strong> {metadata.contact || 'Not specified'}</div>
                <div><strong>Date:</strong> {metadata.date}</div>
                <div><strong>Assessment ID:</strong> {submitted.id}</div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-6">
            <h4 className="font-semibold text-blue-800 mb-2">Shareable Report Link</h4>
            <div className="flex items-center gap-2">
              <input 
                type="text" 
                value={submitted.shareLink} 
                readOnly 
                className="flex-1 p-2 border border-blue-300 rounded bg-white text-sm"
              />
              <button 
                onClick={() => navigator.clipboard.writeText(submitted.shareLink)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
              >
                Copy
              </button>
            </div>
          </div>

          <div className="flex gap-4 justify-center">
            <button 
              onClick={exportToCSV} 
              className="px-6 py-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors font-medium"
            >
              📊 Download Report (CSV)
            </button>
            <button 
              onClick={() => setView('dashboard')} 
              className="px-6 py-3 rounded-lg text-white font-medium transition-colors hover:opacity-90" 
              style={{ backgroundColor: '#ff7a00' }}
            >
              📈 View Dashboard
            </button>
            <button 
              onClick={() => setView('form')} 
              className="px-6 py-3 rounded-lg text-white font-medium transition-colors hover:opacity-90" 
              style={{ backgroundColor: '#0b6b9a' }}
            >
              🔄 New Assessment
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
