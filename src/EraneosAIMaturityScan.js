// Fallback Storage for when GitHub API is not available
class FallbackStorage {
  constructor() {
    this.storageKey = 'eraneos_ai_assessments';
  }

  // Store assessment in localStorage
  storeAssessment(assessmentData) {
    try {
      const existingData = this.getAllAssessments();
      existingData.push(assessmentData);
      localStorage.setItem(this.storageKey, JSON.stringify(existingData));
      console.log('Assessment stored in fallback storage:', assessmentData.id);
      return { success: true, storage: 'localStorage' };
    } catch (error) {
      console.error('Fallback storage failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Get all assessments from localStorage
  getAllAssessments() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) :[];
    } catch (error) {
      console.error('Failed to retrieve from fallback storage:', error);
      return[];
    }
  }

  // Generate export data from localStorage
  generateExport(format = 'csv') {
    const assessments = this.getAllAssessments();
    if (format === 'csv') {
      return this.generateCSV(assessments);
    }
    return JSON.stringify(assessments, null, 2);
  }

  // Generate CSV from stored assessments
  generateCSV(assessments) {
    const rows =[];
    rows.push([
      'Assessment ID', 'Organisation', 'Contact Name', 'Email', 'Industry', 
      'Company Size', 'Role', 'Date', 'Overall Score', 'Maturity Level', 'Timestamp'
    ]);
    
    assessments.forEach(assessment => {
      const meta = assessment.metadata || {};
      const industryText = meta.industry === 'Other' ? `Other (${meta.customIndustry || ''})` : (meta.industry || '');
      
      rows.push([
        assessment.id,
        meta.organisation || 'Anonymous',
        meta.contactName || meta.contact || '', // Fallback to old contact field
        meta.email || '',
        industryText,
        meta.companySize || '',
        meta.role || '',
        meta.date,
        assessment.scores?.overall || '',
        assessment.maturity?.name || '',
        assessment.timestamp
      ]);
    });

    return rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  }

  // Clear all stored assessments
  clearAll() {
    localStorage.removeItem(this.storageKey);
  }
}

// Enhanced GitHub API Service for Assessment Data Management
class GitHubService {
  constructor() {
    // GitHub configuration with Vite environment variable support
    this.owner = import.meta.env.VITE_GITHUB_OWNER || 'florianliepe';
    this.repo = import.meta.env.VITE_GITHUB_REPO || 'AI-maturity-scan';
    this.token = import.meta.env.VITE_GITHUB_TOKEN || null;
    this.baseUrl = 'https://api.github.com';
    this.fallbackStorage = new FallbackStorage();
    
    // Enhanced logging with validation
    console.log('GitHubService initialized:', {
      hasToken: !!this.token,
      tokenPrefix: this.token ? this.token.substring(0, 8) + '...' : 'none',
      tokenValid: this.token ? this.isValidTokenFormat(this.token) : false,
      owner: this.owner,
      repo: this.repo,
      apiUrl: this.baseUrl
    });
    
    // Validate token format
    if (this.token && !this.isValidTokenFormat(this.token)) {
      console.warn('GitHub token format appears invalid. Expected format: ghp_*, github_pat_*, or gho_*');
    }
    
    // Make service available globally for debugging
    if (typeof window !== 'undefined') {
      window.githubService = this;
    }
  }

  // Validate GitHub token format
  isValidTokenFormat(token) {
    if (!token) return false;
    
    return (
      token.startsWith('ghp_') ||           
      token.startsWith('github_pat_') ||    
      token.startsWith('gho_') ||           
      token.startsWith('ghs_') ||           
      (token.length >= 40 && /^[a-zA-Z0-9]+$/.test(token)) 
    );
  }

  // Enhanced token validation with API test
  async validateToken() {
    if (!this.token) {
      return { valid: false, error: 'No token provided' };
    }

    if (!this.isValidTokenFormat(this.token)) {
      return { valid: false, error: 'Invalid token format' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/user`, {
        headers: {
          'Authorization': `token ${this.token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (response.ok) {
        const userData = await response.json();
        console.log('Token validation successful:', userData.login);
        return { valid: true, user: userData.login };
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        return { valid: false, error: `API error: ${errorData.message}` };
      }
    } catch (error) {
      return { valid: false, error: `Network error: ${error.message}` };
    }
  }

  // Check if GitHub integration is available
  isAvailable() {
    const available = !!this.token;
    if (!available) {
      console.warn('GitHub integration not available: Missing VITE_GITHUB_TOKEN');
    }
    return available;
  }

  // Enhanced error handling for API calls
  async makeGitHubRequest(url, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('GitHub token not configured. Please set VITE_GITHUB_TOKEN environment variable.');
    }

    const defaultOptions = {
      headers: {
        'Authorization': `token ${this.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    const mergedOptions = {
      ...defaultOptions,
      ...options,
      headers: { ...defaultOptions.headers, ...options.headers }
    };

    try {
      console.log('Making GitHub API request:', url);
      const response = await fetch(url, mergedOptions);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        const error = new Error(`GitHub API error (${response.status}): ${errorData.message}`);
        error.status = response.status;
        error.response = errorData;
        throw error;
      }

      return response;
    } catch (error) {
      console.error('GitHub API request failed:', error);
      throw error;
    }
  }

  // Get current date path for organized storage
  getDatePath() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}/${month}`;
  }

  // Enhanced store assessment with fallback
  async storeAssessment(assessmentData) {
    // Always store in fallback storage first
    const fallbackResult = this.fallbackStorage.storeAssessment(assessmentData);
    console.log('Fallback storage result:', fallbackResult);

    // Try GitHub storage if available
    if (!this.isAvailable()) {
      console.warn('GitHub token not available, using fallback storage only');
      return { 
        success: true, 
        storage: 'localStorage',
        message: 'Stored locally (GitHub token not configured)',
        fallback: true
      };
    }

    try {
      const datePath = this.getDatePath();
      const fileName = `assessment-${assessmentData.id}-${assessmentData.metadata.organisation || 'anonymous'}.json`;
      const filePath = `reports/${datePath}/${fileName}`;
      
      const content = btoa(JSON.stringify(assessmentData, null, 2));
      
      const response = await this.makeGitHubRequest(`${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${filePath}`, {
        method: 'PUT',
        body: JSON.stringify({
          message: `Add AI maturity assessment: ${assessmentData.metadata.organisation || 'Anonymous'} (${assessmentData.id})`,
          content: content,
          committer: {
            name: 'AI Maturity Scan Bot',
            email: 'ai-scan@eraneos.com'
          }
        })
      });

      const result = await response.json();
      
      // Update the index file
      await this.updateIndex(assessmentData);
      
      return { 
        success: true, 
        storage: 'github',
        sha: result.content.sha,
        url: result.content.html_url,
        path: filePath,
        message: 'Successfully stored in GitHub repository'
      };
    } catch (error) {
      console.error('GitHub storage failed, using fallback:', error);
      return { 
        success: true, 
        storage: 'localStorage',
        error: error.message,
        message: 'GitHub failed, stored locally as backup',
        fallback: true
      };
    }
  }

  // Get fallback storage instance
  getFallbackStorage() {
    return this.fallbackStorage;
  }

  // Update the assessment index for quick access
  async updateIndex(newAssessment) {
    try {
      const indexPath = 'reports/index.json';
      let currentIndex =[];
      
      // Try to get existing index
      try {
        const indexResponse = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${indexPath}`, {
          headers: {
            'Authorization': `token ${this.token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });
        
        if (indexResponse.ok) {
          const indexData = await indexResponse.json();
          currentIndex = JSON.parse(atob(indexData.content));
        }
      } catch (error) {
        // Index doesn't exist yet, start with empty array
        console.log('Creating new index file');
      }

      // Add new assessment to index including new metadata fields
      const meta = newAssessment.metadata || {};
      const indexEntry = {
        id: newAssessment.id,
        timestamp: newAssessment.timestamp,
        organisation: meta.organisation || 'Anonymous',
        contactName: meta.contactName || meta.contact || '', // Support legacy
        email: meta.email || '',
        industry: meta.industry || '',
        customIndustry: meta.customIndustry || '',
        companySize: meta.companySize || '',
        role: meta.role || '',
        date: meta.date,
        overallScore: newAssessment.scores.overall,
        percentageScore: newAssessment.scores.percentage,
        maturityLevel: newAssessment.maturity.name,
        filePath: `reports/${this.getDatePath()}/assessment-${newAssessment.id}-${meta.organisation || 'anonymous'}.json`
      };

      currentIndex.push(indexEntry);
      
      // Sort by timestamp (newest first)
      currentIndex.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      const updatedContent = btoa(JSON.stringify(currentIndex, null, 2));
      
      // Get current index SHA if it exists
      let sha = null;
      try {
        const currentIndexResponse = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${indexPath}`, {
          headers: {
            'Authorization': `token ${this.token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });
        if (currentIndexResponse.ok) {
          const currentIndexData = await currentIndexResponse.json();
          sha = currentIndexData.sha;
        }
      } catch (error) {
        // No existing index
      }

      const indexUpdateBody = {
        message: `Update assessment index with ${meta.organisation || 'Anonymous'} assessment`,
        content: updatedContent,
        committer: {
          name: 'AI Maturity Scan Bot',
          email: 'ai-scan@eraneos.com'
        }
      };

      if (sha) {
        indexUpdateBody.sha = sha;
      }

      await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${indexPath}`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${this.token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify(indexUpdateBody)
      });

    } catch (error) {
      console.error('Failed to update index:', error);
    }
  }

  // Retrieve all assessments from GitHub
  async getAllAssessments() {
    if (!this.isAvailable()) {
      return { success: false, error: 'GitHub token not configured' };
    }

    try {
      const indexPath = 'reports/index.json';
      const response = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${indexPath}`, {
        headers: {
          'Authorization': `token ${this.token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        return { success: true, assessments:[] }; // No assessments yet
      }

      const indexData = await response.json();
      const assessments = JSON.parse(atob(indexData.content));
      
      return { success: true, assessments };
    } catch (error) {
      console.error('Failed to retrieve assessments:', error);
      return { success: false, error: error.message };
    }
  }

  // Retrieve specific assessment data
  async getAssessment(filePath) {
    if (!this.isAvailable()) {
      return { success: false, error: 'GitHub token not configured' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${filePath}`, {
        headers: {
          'Authorization': `token ${this.token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to retrieve assessment: ${response.statusText}`);
      }

      const fileData = await response.json();
      const assessmentData = JSON.parse(atob(fileData.content));
      
      return { success: true, data: assessmentData };
    } catch (error) {
      console.error('Failed to retrieve assessment:', error);
      return { success: false, error: error.message };
    }
  }

  // Delete assessment functionality
  async deleteAssessment(assessmentId, filePath) {
    if (!this.isAvailable()) {
      return { success: false, error: 'GitHub token not configured' };
    }

    try {
      // Get file info first to get SHA
      const fileResponse = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${filePath}`, {
        headers: {
          'Authorization': `token ${this.token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!fileResponse.ok) {
        return { success: false, error: 'Assessment file not found' };
      }

      const fileData = await fileResponse.json();

      // Delete the file
      const deleteResponse = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${filePath}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `token ${this.token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
          message: `Delete assessment: ${assessmentId}`,
          sha: fileData.sha,
          committer: {
            name: 'AI Maturity Scan Bot',
            email: 'ai-scan@eraneos.com'
          }
        })
      });

      if (!deleteResponse.ok) {
        const errorData = await deleteResponse.json().catch(() => ({ message: 'Unknown error' }));
        return { success: false, error: `Delete failed: ${errorData.message}` };
      }

      // Update index to remove the assessment
      await this.removeFromIndex(assessmentId);

      return { success: true, message: 'Assessment deleted successfully' };
    } catch (error) {
      console.error('Delete assessment failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Remove assessment from index
  async removeFromIndex(assessmentId) {
    try {
      const indexPath = 'reports/index.json';
      const indexResponse = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${indexPath}`, {
        headers: {
          'Authorization': `token ${this.token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (indexResponse.ok) {
        const indexData = await indexResponse.json();
        let currentIndex = JSON.parse(atob(indexData.content));
        
        // Remove the assessment from index
        currentIndex = currentIndex.filter(assessment => assessment.id !== assessmentId);
        
        const updatedContent = btoa(JSON.stringify(currentIndex, null, 2));
        
        await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${indexPath}`, {
          method: 'PUT',
          headers: {
            'Authorization': `token ${this.token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json'
          },
          body: JSON.stringify({
            message: `Remove assessment ${assessmentId} from index`,
            content: updatedContent,
            sha: indexData.sha,
            committer: {
              name: 'AI Maturity Scan Bot',
              email: 'ai-scan@eraneos.com'
            }
          })
        });
      }
    } catch (error) {
      console.error('Failed to update index after deletion:', error);
    }
  }

  // Generate bulk export data
  async generateBulkExport(selectedAssessments, format = 'csv') {
    const exportData =[];
    
    for (const assessment of selectedAssessments) {
      try {
        const result = await this.getAssessment(assessment.filePath);
        if (result.success) {
          exportData.push(result.data);
        }
      } catch (error) {
        console.error(`Failed to load assessment ${assessment.id}:`, error);
      }
    }

    if (format === 'csv') {
      return this.generateBulkCSV(exportData);
    } else if (format === 'json') {
      return JSON.stringify(exportData, null, 2);
    }
    
    return exportData;
  }

  // Generate bulk CSV export
  generateBulkCSV(assessments) {
    const rows =[];
    
    // Header row mapping to the new dimensions and metadata
    rows.push([
      'Assessment ID', 'Organisation', 'Contact Name', 'Email', 'Industry', 
      'Company Size', 'Role', 'Date', 'Percentage Score', 'Total Points', 
      'Maturity Level', 'Strategie Avg Score', 'Kultur und Führung Avg Score', 
      'Prozesse Avg Score', 'Governance Avg Score', 'Talent Avg Score', 'Timestamp'
    ]);

    // Data rows
    assessments.forEach(assessment => {
      const categoryScores = {};
      
      if (assessment.scores && assessment.scores.categories) {
        assessment.scores.categories.forEach(cat => {
          categoryScores[cat.id] = cat.score;
        });
      }

      const meta = assessment.metadata || {};
      const industryText = meta.industry === 'Other' ? `Other (${meta.customIndustry || ''})` : (meta.industry || '');

      rows.push([
        assessment.id,
        meta.organisation || 'Anonymous',
        meta.contactName || meta.contact || '', // legacy fallback
        meta.email || '',
        industryText,
        meta.companySize || '',
        meta.role || '',
        meta.date,
        (assessment.scores?.percentage || '') + '%',
        (assessment.scores?.total || '') + ' / ' + (assessment.scores?.max || ''),
        (assessment.maturity?.name) ? assessment.maturity.name : '',
        categoryScores.strategie || '',
        categoryScores.kultur || '',
        categoryScores.prozesse || '',
        categoryScores.governance || '',
        categoryScores.talent || '',
        assessment.timestamp
      ]);
    });

    return rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  }
}

export default GitHubService;
2. Update Main React Application
Please replace the entire contents of src/EraneosAIMaturityScan.js with the following code. This introduces the dropdowns, the conditional text field, the expanded UI, and the powerful new Admin filtering.
code
JavaScript
import React, { useState, useMemo, useEffect } from 'react';
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
import GitHubService from './GitHubService';

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

const ERANEOS_COLORS = { brand: 'bg-[#0b6b9a]', accent: 'bg-[#ff7a00]' };

const INDUSTRIES =['Retail', 'Finance & Insurance', 'Manufacturing', 'Public Sector', 'Healthcare & Life Sciences', 'Technology/IT', 'Services', 'Energy & Utilities', 'Transport & Logistics', 'Defence', 'Other'];
const COMPANY_SIZES =['1-249 (SME)', '250-999 (Mid-Market)', '1000-4999 (Enterprise)', '5000+ (Large Enterprise)'];
const ROLES =['HR / People', 'IT / Data', 'C-Level / Management', 'Operations / Business', 'Other'];

const MATURITY_LEVELS =[
  { level: 1, name: 'AI Ambitioned', color: '#ef4444', description: 'Erste Ambitionen und isolierte Ideen, noch keine systematische Umsetzung.' },
  { level: 2, name: 'AI Piloted', color: '#f97316', description: 'Erste Pilotprojekte und konzeptionelle Überlegungen gestartet.' },
  { level: 3, name: 'AI Empowered', color: '#eab308', description: 'Punktuelle Nutzung, grundlegende Befähigung und erste Frameworks etabliert.' },
  { level: 4, name: 'AI Embedded', color: '#22c55e', description: 'KI ist in Kernprozesse integriert, aktiv gesteuert und skaliert.' },
  { level: 5, name: 'AI First', color: '#0b6b9a', description: 'KI als zentraler strategischer Werttreiber und Kernbestandteil der Wertschöpfung.' }
];

const DIMENSIONS =[
  {
    id: 'strategie',
    title: 'Strategie',
    description: 'Strategische Ausrichtung, operative Integration und kundenorientierte Innovation',
    items:[
      { 
        id: 's_vision', title: 'AI-Strategie & Vision', 
        desc1: 'Reine Ambition, noch keinerlei Initiativen oder konkrete Überlegungen zur KI.',
        desc2: 'Erste konzeptionelle Überlegungen zur KI-Strategie finden statt.',
        desc3: 'Es existiert keine klar definierte AI-Strategie. Einzelne Initiativen entstehen isoliert, ohne übergeordnete Vision oder Bezug zu den Unternehmenszielen.',
        desc4: 'Eine AI-Strategie ist formuliert und an die Unternehmensstrategie gekoppelt. Priorisierte Anwendungsfelder und Zielbilder sind definiert.',
        desc5: 'Die AI-Vision ist fest im Geschäftsmodell verankert. AI gilt als strategischer Werttreiber und wird kontinuierlich an Markt- und Technologietrends angepasst.',
        messgroessen: 'Anteil strategischer Initiativen mit AI-Bezug (%), Anteil am Geschäftserfolg / Beitrag zu P&L (%), Anteil der Geschäftsbereiche mit einer AI-Strategie (%)'
      },
      { 
        id: 's_operative', title: 'Operative AI-Integration (Interne Perspektive)', 
        desc1: 'Keine operative Nutzung von KI angedacht.',
        desc2: 'Erste isolierte Tests zur operativen Unterstützung.',
        desc3: 'AI wird punktuell eingesetzt, meist in isolierten Anwendungen oder Proof of Concept.',
        desc4: 'AI ist in Kernprozesse integriert und unterstützt Entscheidungsfindung, Kommunikation oder Wissensmanagement.',
        desc5: 'AI ist zentraler Bestandteil der Unternehmensarchitektur. Produkte, Prozesse und Services sind KI-nativ und nutzen autonome Agenten für durchgängige Wertschöpfung.',
        messgroessen: 'Erfolgsquote der PoCs (z. B. Zielerreichung), Anteil Kernprozesse mit AI-Unterstützung (%), Anzahl Patente oder proprietärer Technologien'
      },
      { 
        id: 's_kunden', title: 'Kundenorientierte AI-Innovation (Kunden-Perspektive)', 
        desc1: 'Kundenprodukte enthalten keinerlei KI-Aspekte.',
        desc2: 'Ideen zur KI-Integration in Produkte werden gesammelt.',
        desc3: 'AI wird in Produkten oder Services kaum berücksichtigt. Erste Ideen entstehen vereinzelt, bleiben aber meist experimentell oder konzeptionell.',
        desc4: 'AI wird gezielt in bestehende Produkte integriert, um Funktionen zu automatisieren oder zu personalisieren. Nutzerfeedback und Daten fließen ein.',
        desc5: 'Produkte und Services werden Agent-first gedacht und entwickelt. Intelligente, autonome AI-Komponenten sind Kernbestandteil der Wertschöpfung.',
        messgroessen: 'Anteil der Produkte, in denen KI-Ideen existieren (%), Anteil PoCs, die über die Konzeptphase hinauskommen (%), Umsatzanteil durch KI'
      },
      { 
        id: 's_ressourcen', title: 'Ressourcenallokation', 
        desc1: 'Es gibt weder Budgets noch Personal für KI.',
        desc2: 'Geringfügige Projektbudgets für erste PoCs werden ad-hoc freigegeben.',
        desc3: 'Für AI-Projekte stehen nur begrenzte, meist projektbezogene Mittel ohne langfristige Planung zur Verfügung.',
        desc4: 'Budgets, Rollen und Verantwortlichkeiten für AI-Initiativen sind definiert. Erste dedizierte Ressourcen (z.B. Data Scientists) sind vorhanden.',
        desc5: 'Die Ressourcenplanung für AI ist strategisch und nachhaltig integriert. AI-Kompetenzen und Budgets sind fester Bestandteil der Unternehmenssteuerung.',
        messgroessen: 'Anteil des AI-Budgets in kundennahen und unterstützenden Funktionen am IT-Budget (%)'
      },
      { 
        id: 's_nutzen', title: 'Nutzenmessung und -validierung', 
        desc1: 'Erfolg oder Misserfolg von Projekten wird nicht bewertet.',
        desc2: 'Initiale, rein qualitative Bewertung von ersten KI-Tests.',
        desc3: 'Der Nutzen von AI-Projekten wird nicht systematisch erfasst. Erfolge oder Misserfolge beruhen auf subjektiver Einschätzung.',
        desc4: 'Erste Kennzahlen und Bewertungsmethoden sind definiert. Der Nutzen ausgewählter Initiativen wird punktuell gemessen und für Entscheidungen genutzt.',
        desc5: 'Der Wertbeitrag von AI wird kontinuierlich und datenbasiert gemessen. Ein standardisiertes Framework steuert Prioritäten und Investitionen.',
        messgroessen: 'Anteil der AI-Projekte, für die messbare KPIs definiert sind (%), Durchschnittlicher ROI von AI-Projekten'
      }
    ]
  },
  {
    id: 'kultur',
    title: 'Kultur und Führung',
    description: 'Offenheit, Change-Management und Leadership',
    items:[
      { 
        id: 'k_offenheit', title: 'Offenheit für Innovation', 
        desc1: 'Strikte Ablehnung von KI; Festhalten an traditionellen Methoden.',
        desc2: 'Einzelne Mitarbeiter zeigen Interesse, aber die Organisation bleibt verhalten.',
        desc3: 'AI-Innovationen stoßen auf Skepsis. Eine risikoaverse Haltung dominiert.',
        desc4: 'Beschäftigte und Führungskräfte zeigen wachsendes Interesse an AI. Pilotprojekte fördern erste Lernprozesse.',
        desc5: 'Eine innovationsfreundliche Kultur ist etabliert. AI-Experimente werden aktiv gefördert und als Lernchance genutzt.',
        messgroessen: 'Anteil der Beschäftigten, die an Innovations- oder AI-Ideeninitiativen teilnehmen (%), Anzahl interner Innovationsprojekte pro Jahr'
      },
      { 
        id: 'k_akzeptanz', title: 'Beschäftigtenakzeptanz', 
        desc1: 'Offene Ablehnung und Angst vor Arbeitsplatzverlust durch KI.',
        desc2: 'Abwartende Haltung der Belegschaft gegenüber KI-Tools.',
        desc3: 'AI wird als Bedrohung oder Belastung wahrgenommen. Verständnis für Nutzen und Auswirkungen fehlt.',
        desc4: 'Beschäftigte zeigen Offenheit, wenn Nutzen transparent kommuniziert und Beteiligung ermöglicht wird.',
        desc5: 'AI wird als Enabler verstanden. Mitarbeitende nutzen AI aktiv, um ihre Arbeit zu verbessern und neue Ideen einzubringen.',
        messgroessen: 'Nutzungsquote bereitgestellter AI-Tools (z. B. % der berechtigten User, die aktiv verwenden)'
      },
      { 
        id: 'k_fehler', title: 'Umgang mit Fehlern', 
        desc1: 'Fehlerkultur ist nicht vorhanden; Fehler werden streng sanktioniert.',
        desc2: 'Fehler bei Innovationen werden toleriert, aber nicht systematisch ausgewertet.',
        desc3: 'Fehler werden sanktioniert oder verschwiegen. Lernprozesse finden kaum statt.',
        desc4: 'Fehler werden zunehmend als Teil des Lernprozesses akzeptiert. Post-Mortems und „Lessons Learned“ fördern Reflexion.',
        desc5: 'Eine ausgeprägte Lernkultur ist etabliert. Scheitern wird als notwendiger Bestandteil von Innovation verstanden und offen reflektiert.',
        messgroessen: 'Anzahl Retrospektiven nach AI-Projekten'
      },
      { 
        id: 'k_transformation', title: 'Transformationskompetenz', 
        desc1: 'Es gibt kein Change-Management im Unternehmen.',
        desc2: 'Change-Management wird punktuell angedacht, aber nicht strukturiert umgesetzt.',
        desc3: 'Veränderungen im Zusammenhang mit AI erfolgen unstrukturiert und ohne gezielte Begleitung.',
        desc4: 'Change-Prozesse werden aktiv gesteuert – durch Kommunikation, Schulungen und begleitende Maßnahmen.',
        desc5: 'Change-Management ist institutionalisiert. Transformationen werden professionell, datengestützt und adaptiv gesteuert.',
        messgroessen: 'Anzahl von Beschäftigten in Change-Management-Trainings, Anteil begleiteter AI-Projekte (%)'
      },
      { 
        id: 'k_leadership', title: 'Leadership Commitment & Ownership', 
        desc1: 'Management ignoriert das Thema KI vollständig.',
        desc2: 'Einzelne Führungskräfte informieren sich über KI, ohne aktive Förderung.',
        desc3: 'Führungskräfte delegieren AI-Themen an IT oder Fachbereiche. Persönliche Verantwortungsübernahme und aktive Förderung fehlen.',
        desc4: 'Führungskräfte übernehmen zunehmend Verantwortung für AI-Initiativen. Einzelne Champions treiben den Wandel voran.',
        desc5: 'Führungskräfte leben AI-Transformation als persönlichen Auftrag vor. Sie übernehmen aktiv Ownership und schaffen psychologische Sicherheit.',
        messgroessen: 'Existenz eines benannten AI-Verantwortlichen oder einer AI-Governance-Struktur (ja/nein)'
      },
      { 
        id: 'k_kommunikation', title: 'Interne Kommunikation & Sichtbarkeit', 
        desc1: 'Keine Kommunikation zu Technologietrends oder KI.',
        desc2: 'Sporadische, unstrukturierte Erwähnung von KI in Meetings.',
        desc3: 'AI-Projekte laufen isoliert, ohne klare Kommunikation oder Sichtbarkeit im Unternehmen.',
        desc4: 'AI-Initiativen werden regelmäßig vorgestellt und mit strategischen Zielen verknüpft.',
        desc5: 'Transparente Kommunikation ist Standard. AI-Erfolge, Learnings und KPIs werden offen geteilt und inspirieren weitere Bereiche.',
        messgroessen: 'Häufigkeit der internen Kommunikation zu AI-Themen, Anzahl der intern vorgestellten AI-Themen'
      }
    ]
  },
  {
    id: 'prozesse',
    title: 'Prozesse',
    description: 'Transparenz, Optimierung, Prozessdesign und Skalierbarkeit',
    items:[
      { 
        id: 'p_transparenz', title: 'Prozesstransparenz & Nachvollziehbarkeit', 
        desc1: 'Prozesse sind generell unzureichend dokumentiert.',
        desc2: 'Erste Dokumentationen von Standardprozessen, KI-Prozesse sind Blackbox.',
        desc3: 'AI-Prozesse sind intransparent und schwer nachvollziehbar. Entscheidungslogik bleibt für Nutzer unklar.',
        desc4: 'Erste Transparenzanforderungen werden umgesetzt. Kritische AI-Entscheidungen sind dokumentiert und erklärbar.',
        desc5: 'Vollständige Prozesstransparenz ist Standard. AI-Entscheidungen sind nachvollziehbar, auditierbar und für alle Stakeholder verständlich.',
        messgroessen: 'Anteil produktiver AI-Systeme mit erklärbarer Logik (%), Existenz branchenspezifischer Erklärbarkeitsanforderungen (ja/nein)'
      },
      { 
        id: 'p_optimierung', title: 'Kontinuierliche Optimierung & Lernzyklen', 
        desc1: 'Einmal eingeführte Systeme werden nie wieder angepasst.',
        desc2: 'Systeme werden nur bei akuten Fehlern (reaktiv) angepasst.',
        desc3: 'AI-Prozesse werden nach Einführung kaum überprüft oder angepasst. Feedback wird selten berücksichtigt.',
        desc4: 'AI-Prozesse werden regelmäßig überprüft und angepasst. Feedback wird punktuell integriert.',
        desc5: 'Kontinuierliche Verbesserung ist fest verankert. Daten und Feedback fließen systematisch in iterative Lernzyklen ein.',
        messgroessen: 'Anzahl der kontinuierlichen Verbesserungsprozesse (KVP), Häufigkeit von Prozessoptimierungen pro AI-System'
      },
      { 
        id: 'p_design', title: 'Prozessdesign & Human-in-the-Loop', 
        desc1: 'Automatisierung wird ohne Rücksicht auf menschliche Kontrolle implementiert.',
        desc2: 'Menschliche Eingriffe erfolgen zufällig und unstrukturiert.',
        desc3: 'AI-Prozesse werden ohne klare menschliche Kontrollpunkte entwickelt. Entscheidungen erfolgen weitgehend automatisiert.',
        desc4: 'Menschliche Kontrolle ist in kritischen Prozessschritten vorgesehen. Eingriffspunkte sind definiert, aber nicht konsequent umgesetzt.',
        desc5: 'Prozesse sind bewusst menschzentriert gestaltet. AI unterstützt Entscheidungen in transparentem, kontrollierbarem Zusammenspiel.',
        messgroessen: 'Anzahl kritischer Entscheidungen mit Human-in-the-Loop, Anteil der AI-Prozesse mit definierten menschlichen Kontrollpunkten (%)'
      },
      { 
        id: 'p_skalierbarkeit', title: 'Prozessskalierbarkeit & Standardisierung', 
        desc1: 'Jede technische Lösung wird komplett neu und isoliert entwickelt.',
        desc2: 'Erste Versuche, Code-Snippets oder Daten wiederzuverwenden.',
        desc3: 'AI-Lösungen werden als Einzelprojekte umgesetzt, ohne zentrale Skalierungsstrategie.',
        desc4: 'Wiederverwendbare Komponenten und erste Plattformen zur Skalierung von AI-Lösungen bestehen.',
        desc5: 'Skalierbare AI-Plattform ermöglicht schnellen Roll-out, Monitoring und kontinuierliche Verbesserung unternehmensweiter Lösungen.',
        messgroessen: 'Anteil der mehrfach eingesetzten AI-Use Cases (%), Durchschnittliche Zeit von Entwicklung bis Rollout, Anzahl wiederverwendbarer Komponenten'
      }
    ]
  },
  {
    id: 'governance',
    title: 'Governance',
    description: 'Governance-Strukturen, Ethik, Compliance und Sicherheit',
    items:[
      { 
        id: 'g_formell', title: 'Formelle Governance-Prozesse', 
        desc1: 'Es gibt keinerlei IT- oder Daten-Governance im Unternehmen.',
        desc2: 'Generelle IT-Governance existiert, aber deckt KI nicht ab.',
        desc3: 'Es existieren keine institutionalisierten Governance-Strukturen für AI. Entscheidungen werden ad hoc und ohne standardisierte Prozesse getroffen.',
        desc4: 'Erste formelle AI-Governance-Gremien sind etabliert (z.B. AI-Komitee). Entscheidungsprozesse und Eskalationswege werden strukturierter.',
        desc5: 'Umfassende AI-Governance mit klaren institutionellen Rollen, standardisierten Entscheidungsprozessen und etablierten Eskalationswegen ist vollständig implementiert.',
        messgroessen: 'Existenz eines AI-Governance-Gremiums (ja/nein), Anzahl definierter Rollen, Häufigkeit der Meetings'
      },
      { 
        id: 'g_ethik', title: 'Ethik & Verantwortungsrahmen', 
        desc1: 'Ethik und Fairness spielen bei Technologieentscheidungen keine Rolle.',
        desc2: 'Bewusstsein für ethische Risiken entsteht, aber ohne Maßnahmen.',
        desc3: 'Ethische Fragen zu AI (Bias, Fairness, Transparenz) werden kaum berücksichtigt.',
        desc4: 'Erste interne Ethikleitlinien und Selbstverpflichtungen für AI-Einsatz werden entwickelt.',
        desc5: 'Ethische Prinzipien sind verbindlich verankert, überprüfbar und werden regelmäßig intern evaluiert.',
        messgroessen: 'Existenz verbindlicher interner AI-Ethikrichtlinien (ja/nein), Anzahl durchgeführter interner Ethik-Reviews pro Jahr'
      },
      { 
        id: 'g_risiko', title: 'Risikomanagement & Compliance', 
        desc1: 'Risikomanagement existiert nicht oder erfasst keine IT-Risiken.',
        desc2: 'Schatten-IT und unregulierte KI-Nutzung wird teilweise geduldet.',
        desc3: 'Geschäftsrisiken durch AI werden nicht systematisch identifiziert. Compliance-Anforderungen sind unklar und werden reaktiv behandelt.',
        desc4: 'Erste Business-Risikoframeworks für AI sind etabliert. Kritische Geschäftsanwendungen werden auf Compliance-Risiken hin überwacht.',
        desc5: 'Umfassendes AI-Risikomanagement ist in Geschäftsprozesse integriert. Proaktive Compliance-Überwachung und systematische Risikosteuerung sind Standard.',
        messgroessen: 'Anteil der AI-Projekte mit dokumentierter Risikoanalyse (%), Häufigkeit von internen AI-Compliance-Audits pro Jahr'
      },
      { 
        id: 'g_sicherheit', title: 'AI-Sicherheit & Kontrolle', 
        desc1: 'Keine Sicherheitskonzepte für den Umgang mit Daten und Algorithmen.',
        desc2: 'Standard-IT-Sicherheit greift, aber spezielle KI-Bedrohungen werden ignoriert.',
        desc3: 'AI-Systeme werden ohne systematische Sicherheitskontrollen eingesetzt. Überwachung und Kontrolle fehlen.',
        desc4: 'Erste Sicherheitsstandards und Kontrollmechanismen für AI-Systeme sind definiert und werden teilweise umgesetzt.',
        desc5: 'Umfassende AI-Sicherheitsarchitektur mit kontinuierlicher Überwachung, Kontrolle und Incident-Management ist etabliert.',
        messgroessen: 'Anteil der AI-Systeme mit implementierten Sicherheitskontrollen (%), Durchschnittliche Reaktionszeit bei Vorfällen'
      }
    ]
  },
  {
    id: 'talent',
    title: 'Talent',
    description: 'Kompetenzaufbau, Motivation, Leadership und Befähigung',
    items:[
      { 
        id: 't_kompetenz', title: 'AI-Kompetenz', 
        desc1: 'Es gibt kein technisches Know-how im Bereich Daten oder KI.',
        desc2: 'Vereinzeltes Wissen bei Individuen, aber kein organisatorischer Aufbau.',
        desc3: 'Grundkenntnisse zu AI sind kaum vorhanden. Beschäftigte fühlen sich unsicher im Umgang mit dem Thema.',
        desc4: 'Erste AI-Kompetenzen sind aufgebaut, insbesondere in relevanten Rollen. Schulungsprogramme laufen an.',
        desc5: 'Ein breites Kompetenzniveau besteht im gesamten Unternehmen. AI-Know-how ist Teil kontinuierlicher Weiterbildung und Karrierepfade.',
        messgroessen: 'Anteil der Beschäftigten mit nachgewiesener AI- oder Datenkompetenz (z.B. Zertifizierung, Schulungsabschluss) (%)'
      },
      { 
        id: 't_motivation', title: 'Motivation & Beteiligung', 
        desc1: 'Belegschaft ist stark demotiviert bezüglich neuer Technologien.',
        desc2: 'Geringes Interesse, Technologie wird als reines IT-Thema gesehen.',
        desc3: 'Geringe Motivation, sich mit AI zu beschäftigen. Beschäftigte sehen keinen persönlichen Nutzen.',
        desc4: 'Beschäftigte zeigen Interesse und beteiligen sich, wenn sie aktiv eingebunden werden.',
        desc5: 'Hohe Eigenmotivation und aktives Engagement. Mitarbeitende bringen selbst AI-Ideen ein und treiben Projekte voran.',
        messgroessen: 'Anteil der Beschäftigten, die sich aktiv an AI-Initiativen beteiligen oder Vorschläge einreichen (%)'
      },
      { 
        id: 't_leadership', title: 'AI-Leadership', 
        desc1: 'Führungsebene ignoriert KI und fokussiert sich auf das klassische Kerngeschäft.',
        desc2: 'Führungsebene hat von KI gehört, übernimmt aber keine Vorbildfunktion.',
        desc3: 'Führungskräfte haben sich AI-Grundwissen angeeignet und können fachlich fundierte Entscheidungen treffen. Sie befähigen ihre Teams.',
        desc4: 'Führung unterstützt KI-Projekte aktiv. Es gibt Botschafter für den Wandel.',
        desc5: 'Führung lebt KI-Transformation als kulturellen Auftrag: visionär, menschzentriert, datenbasiert. Sie schafft Innovationsmut.',
        messgroessen: 'Anteil der Führungskräfte, die KI im Kontext ihrer Strategie verstehen, Anzahl Schulungen zu KI für Führungskräfte'
      },
      { 
        id: 't_coaching', title: 'AI-Coaching & Befähigung', 
        desc1: 'Keinerlei Schulungsangebote im Technologiebereich.',
        desc2: 'Es gibt generelle IT-Schulungen, aber kein KI-spezifisches Coaching.',
        desc3: 'Mitarbeitende erhalten punktuell Schulungen, aber keine individuelle Begleitung.',
        desc4: 'AI-Coaches oder Botschafter begleiten Projekte und fördern praxisnahes Lernen.',
        desc5: 'AI-Coaching ist institutionalisiert. Interne Coaches, Communities und Feedbackschleifen sichern kontinuierliches Lernen.',
        messgroessen: 'Anteil der Mitarbeitenden in AI-Schulungen (letzte 12 Monate) (%), Anzahl verschiedener AI-Weiterbildungsformate'
      }
    ]
  }
];

export default function EraneosAIMaturityScan() {
  const initialAnswers = useMemo(() => {
    const map = {};
    DIMENSIONS.forEach(cat => cat.items.forEach(q => (map[q.id] = 3)));
    return map;
  },[]);

  const [answers, setAnswers] = useState(initialAnswers);
  const [metadata, setMetadata] = useState({ 
    organisation: '', 
    contactName: '', 
    email: '', 
    industry: '', 
    customIndustry: '', 
    companySize: '', 
    role: '', 
    date: new Date().toISOString().slice(0,10) 
  });
  const [submitted, setSubmitted] = useState(null);
  const [view, setView] = useState('form'); 
  const[reportData, setReportData] = useState(null);
  const [submissionStatus, setSubmissionStatus] = useState({ github: false, email: false });
  
  const[allAssessments, setAllAssessments] = useState([]);
  const [selectedAssessments, setSelectedAssessments] = useState([]);
  const[filters, setFilters] = useState({
    dateFrom: '', dateTo: '', organisation: '', contactName: '', industry: '', companySize: '', role: '', maturityLevel: '', scoreMin: '', scoreMax: ''
  });
  const [loading, setLoading] = useState(false);
  
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminLoginError, setAdminLoginError] = useState('');
  
  const githubService = useMemo(() => new GitHubService(),[]);

  useEffect(() => {
    const validateGitHubToken = async () => {
      if (githubService.isAvailable()) {
        const validation = await githubService.validateToken();
        if (!validation.valid) {
          console.warn('GitHub token validation failed:', validation.error);
        }
      }
    };
    validateGitHubToken();
  }, [githubService]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const reportParam = urlParams.get('report');
    if (reportParam) {
      try {
        const decodedData = JSON.parse(atob(reportParam));
        setReportData(decodedData);
        setView('report');
      } catch (error) {
        console.error('Invalid report data in URL');
      }
    }
  },[]);

  const handleAnswer = (qid, val) => setAnswers(prev => ({ ...prev, [qid]: Number(val) }));

  const computeScores = () => {
    let totalScoreSum = 0;
    let totalQuestionsCount = 0;

    const catScores = DIMENSIONS.map(cat => {
      const sum = cat.items.reduce((s, q) => s + (answers[q.id] || 0), 0);
      const avg = sum / cat.items.length;
      totalScoreSum += sum;
      totalQuestionsCount += cat.items.length;
      return { id: cat.id, title: cat.title, score: Number((avg).toFixed(2)), total: sum };
    });
    
    const maxPossibleScore = totalQuestionsCount * 5; 
    const percentage = Math.round((totalScoreSum / maxPossibleScore) * 100);
    const overallAverage = Number((totalScoreSum / totalQuestionsCount).toFixed(2));
    
    return { 
      categories: catScores, 
      overall: overallAverage,
      total: totalScoreSum,
      percentage: percentage,
      max: maxPossibleScore
    };
  };

  const scores = computeScores();
  const levelIndex = Math.min(4, Math.max(0, Math.ceil(scores.percentage / 20) - 1));
  const maturity = MATURITY_LEVELS[levelIndex];

  const exportToCSV = () => {
    const csvContent = generateCSVContent({ metadata, answers, scores, maturity });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eraneos-ai-scan-${metadata.organisation || 'anonymous'}-${metadata.date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const generateCSVContent = (assessmentData) => {
    const rows = [];
    rows.push(['Dimension', 'Subdimension', 'Answer (1-5)']);
    DIMENSIONS.forEach(cat => {
      cat.items.forEach(q => rows.push([cat.title, q.title, assessmentData.answers[q.id] || 0]));
    });
    rows.push([]);
    
    const meta = assessmentData.metadata || {};
    const industryText = meta.industry === 'Other' ? `Other (${meta.customIndustry || ''})` : (meta.industry || '');

    rows.push(['Metadata', 'Organisation', meta.organisation || '']);
    rows.push(['Metadata', 'Contact Name', meta.contactName || meta.contact || '']);
    rows.push(['Metadata', 'Email', meta.email || '']);
    rows.push(['Metadata', 'Industry', industryText]);
    rows.push(['Metadata', 'Company Size', meta.companySize || '']);
    rows.push(['Metadata', 'Role', meta.role || '']);
    rows.push(['Metadata', 'Date', meta.date]);
    
    const totalText = assessmentData.scores.total ? `${assessmentData.scores.total} / ${assessmentData.scores.max}` : 'N/A (Old Format)';
    const pctText = assessmentData.scores.percentage ? `${assessmentData.scores.percentage}%` : 'N/A (Old Format)';
    
    rows.push(['Results', 'Total Score', totalText]);
    rows.push(['Results', 'Percentage', pctText]);
    rows.push(['Results', '1-5 Average', assessmentData.scores.overall]);
    rows.push(['Results', 'Maturity Level', assessmentData.maturity.name]);
    
    return rows.map(row => row.map(cell => `"${cell || ''}"`).join(',')).join('\n');
  };

  const submitToGitHub = async (assessmentData) => {
    try {
      const result = await githubService.storeAssessment(assessmentData);
      setSubmissionStatus(prev => ({ 
        ...prev, 
        github: result.success ? 'success' : 'failed',
        githubDetails: {
          storage: result.storage, message: result.message, fallback: result.fallback, error: result.error
        }
      }));
      return result.success;
    } catch (error) {
      setSubmissionStatus(prev => ({ 
        ...prev, github: 'failed',
        githubDetails: { storage: 'none', message: 'Complete failure', error: error.message }
      }));
      return false;
    }
  };

  const loadAllAssessments = async () => {
    setLoading(true);
    try {
      const result = await githubService.getAllAssessments();
      if (result.success) setAllAssessments(result.assessments);
    } catch (error) {
      console.error('Error loading assessments:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredAssessments = useMemo(() => {
    return allAssessments.filter(assessment => {
      // Basic Filters
      if (filters.dateFrom && new Date(assessment.date) < new Date(filters.dateFrom)) return false;
      if (filters.dateTo && new Date(assessment.date) > new Date(filters.dateTo)) return false;
      if (filters.organisation && !assessment.organisation.toLowerCase().includes(filters.organisation.toLowerCase())) return false;
      if (filters.maturityLevel && assessment.maturityLevel !== filters.maturityLevel) return false;
      if (filters.scoreMin && assessment.overallScore < parseFloat(filters.scoreMin)) return false;
      if (filters.scoreMax && assessment.overallScore > parseFloat(filters.scoreMax)) return false;
      
      // New Enriched Filters (handle legacy empty fields safely)
      if (filters.contactName) {
        const nameToSearch = (assessment.contactName || assessment.contact || '').toLowerCase();
        if (!nameToSearch.includes(filters.contactName.toLowerCase())) return false;
      }
      if (filters.industry) {
        const ind = (assessment.industry || '').toLowerCase();
        if (filters.industry === 'Other') {
          if (!ind.startsWith('other')) return false;
        } else {
          if (ind !== filters.industry.toLowerCase()) return false;
        }
      }
      if (filters.companySize && assessment.companySize !== filters.companySize) return false;
      if (filters.role && assessment.role !== filters.role) return false;

      return true;
    });
  },[allAssessments, filters]);

  const handleBulkExport = async (format = 'csv') => {
    if (selectedAssessments.length === 0) return alert('Please select assessments to export');
    setLoading(true);
    try {
      const selectedData = allAssessments.filter(a => selectedAssessments.includes(a.id));
      const exportContent = await githubService.generateBulkExport(selectedData, format);
      const blob = new Blob([exportContent], { type: format === 'csv' ? 'text/csv' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `eraneos-bulk-export-${new Date().toISOString().slice(0,10)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  };

  const analytics = useMemo(() => {
    if (allAssessments.length === 0) return null;
    const totalAssessments = allAssessments.length;
    const averageScore = allAssessments.reduce((sum, a) => sum + a.overallScore, 0) / totalAssessments;
    const maturityDistribution = MATURITY_LEVELS.reduce((dist, level) => {
      dist[level.name] = allAssessments.filter(a => a.maturityLevel === level.name).length;
      return dist;
    }, {});
    const recentAssessments = allAssessments.filter(a => new Date(a.timestamp) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length;
    return { totalAssessments, averageScore: averageScore.toFixed(2), maturityDistribution, recentAssessments };
  },[allAssessments]);

  const sendEmailReport = async (assessmentData) => {
    try {
      console.log('Simulating Email Send', assessmentData.id);
      await new Promise(resolve => setTimeout(resolve, 1500));
      return true;
    } catch (error) {
      return false;
    }
  };

  const generateReportLink = (assessmentData) => {
    const encodedData = btoa(JSON.stringify(assessmentData));
    return `${window.location.origin}${window.location.pathname}?report=${encodedData}`;
  };

  const handleAdminLogin = () => { setShowAdminLogin(true); setAdminLoginError(''); setAdminPassword(''); };
  
  const handleAdminPasswordSubmit = (e) => {
    e.preventDefault();
    const correctPassword = import.meta.env.VITE_ADMIN_PASSWORD || 'eraneos2024';
    if (adminPassword === correctPassword) {
      setIsAdminAuthenticated(true); setShowAdminLogin(false); sessionStorage.setItem('adminAuthenticated', 'true');
    } else {
      setAdminLoginError('Incorrect password. Please try again.');
    }
  };
  
  const handleAdminLogout = () => {
    setIsAdminAuthenticated(false); sessionStorage.removeItem('adminAuthenticated'); if (view === 'admin') setView('form');
  };

  useEffect(() => {
    const isAuthenticated = sessionStorage.getItem('adminAuthenticated') === 'true';
    setIsAdminAuthenticated(isAuthenticated);
  },[]);

  const handleDeleteAssessment = (assessment) => {
    if (window.confirm(`Delete assessment for ${assessment.organisation}?`)) {
      const password = prompt('Enter admin password:');
      if (password === (import.meta.env.VITE_ADMIN_PASSWORD || 'eraneos2024')) deleteAssessment(assessment);
      else alert('Incorrect password');
    }
  };

  const deleteAssessment = async (assessment) => {
    setLoading(true);
    try {
      const result = await githubService.deleteAssessment(assessment.id, assessment.filePath);
      if (result.success) {
        setAllAssessments(prev => prev.filter(a => a.id !== assessment.id));
        setSelectedAssessments(prev => prev.filter(id => id !== assessment.id));
      } else alert('Delete failed: ' + result.message);
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    const id = Date.now().toString();
    const assessmentData = { id, metadata, answers, scores, maturity, timestamp: new Date().toISOString(), version: '4.0' };
    const shareLink = generateReportLink(assessmentData);
    setSubmitted({ id, payload: assessmentData, shareLink });
    setView('result');
    setSubmissionStatus({ github: 'pending', email: 'pending' });
    const githubSuccess = await submitToGitHub(assessmentData);
    setSubmissionStatus(prev => ({ ...prev, github: githubSuccess ? 'success' : 'failed' }));
    const emailSuccess = await sendEmailReport(assessmentData);
    setSubmissionStatus(prev => ({ ...prev, email: emailSuccess ? 'success' : 'failed' }));
  };

  const getRadarData = (sourceScores) => ({
    labels: sourceScores.categories.map(c => c.title.replace(' & ', '\n& ')),
    datasets:[
      {
        label: 'Current Maturity',
        data: sourceScores.categories.map(c => c.score),
        backgroundColor: 'rgba(11, 107, 154, 0.15)',
        borderColor: '#0b6b9a',
        borderWidth: 3,
        pointBackgroundColor: '#ff7a00',
        pointBorderColor: '#ff7a00',
        pointRadius: 6,
        pointHoverRadius: 8,
      },
      {
        label: 'Target (AI First)',
        data: new Array(sourceScores.categories.length).fill(5),
        backgroundColor: 'rgba(255, 122, 0, 0.05)',
        borderColor: '#ff7a00',
        borderWidth: 2,
        borderDash: [5, 5],
        pointBackgroundColor: 'transparent',
        pointBorderColor: 'transparent',
        pointRadius: 0,
      },
    ],
  });

  const radarOptions = {
    responsive: true, maintainAspectRatio: false,
    scales: {
      r: {
        beginAtZero: true, max: 5, min: 0,
        ticks: { stepSize: 1, font: { size: 12 }, color: '#6b7280' },
        grid: { color: '#e5e7eb' }, angleLines: { color: '#e5e7eb' },
        pointLabels: { font: { size: 11, weight: 'bold' }, color: '#374151' },
      },
    },
    plugins: {
      legend: { position: 'bottom', labels: { font: { size: 12 }, padding: 20 } },
      tooltip: { callbacks: { label: function(context) { return `${context.dataset.label}: ${context.parsed.r.toFixed(1)}`; } } },
    },
  };

  const getBarData = (sourceScores) => ({
    labels: sourceScores.categories.map(c => c.title.split(' ')[0]),
    datasets:[{
      label: 'Current Score',
      data: sourceScores.categories.map(c => c.score),
      backgroundColor: sourceScores.categories.map(c => MATURITY_LEVELS[Math.max(0, Math.min(4, Math.round(c.score) - 1))].color + '80'),
      borderColor: sourceScores.categories.map(c => MATURITY_LEVELS[Math.max(0, Math.min(4, Math.round(c.score) - 1))].color),
      borderWidth: 2, borderRadius: 4,
    }],
  });

  const barOptions = {
    responsive: true, maintainAspectRatio: false,
    scales: { y: { beginAtZero: true, max: 5, ticks: { stepSize: 1 } }, x: { grid: { display: false } } },
    plugins: { legend: { display: false } },
  };

  return (
    <div className="p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen">
      {/* Header Section */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 bg-white p-6 rounded-lg shadow-sm relative gap-4">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-xl ${ERANEOS_COLORS.brand}`}>E</div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Eraneos — AI Readiness & Maturity Scan</h1>
            <p className="text-gray-600">Comprehensive AI Framework Assessment (1-5 Scale)</p>
          </div>
        </div>
        
        {!isAdminAuthenticated && (
          <button onClick={handleAdminLogin} className="absolute top-4 right-4 text-xs text-gray-400 hover:text-gray-600">Admin</button>
        )}
        {isAdminAuthenticated && (
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <span className="text-xs text-green-600 font-medium">● Admin</span>
            <button onClick={handleAdminLogout} className="text-xs text-gray-400 hover:text-gray-600">Logout</button>
          </div>
        )}
        
        <div className="text-right bg-gray-50 p-3 rounded-lg border border-gray-100 min-w-[200px]">
          <div className="text-sm text-gray-600 mb-1">Overall Assessment</div>
          <div className="flex items-center justify-between gap-4">
            <div className="font-bold text-2xl text-gray-800">{scores.total}<span className="text-sm text-gray-500 font-normal"> / {scores.max} pts</span></div>
            <div className="px-3 py-1 rounded text-white font-bold text-sm shadow-sm" style={{ backgroundColor: maturity.color }}>
              {scores.percentage}% ({maturity.name})
            </div>
          </div>
        </div>
      </header>

      {/* Admin Login Modal */}
      {showAdminLogin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">Admin Login</h3>
            <form onSubmit={handleAdminPasswordSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500" autoFocus />
              </div>
              {adminLoginError && <div className="mb-4 p-3 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm">{adminLoginError}</div>}
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowAdminLogin(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Login</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Form View */}
      {view === 'form' && (
        <div className="space-y-6">
          <section className="bg-white p-6 rounded-lg shadow-sm">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">Assessment Information</h2>
            
            {/* Row 1: Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <input className="p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Organisation" value={metadata.organisation} onChange={e => setMetadata(s => ({ ...s, organisation: e.target.value }))} />
              <input className="p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Contact Name" value={metadata.contactName} onChange={e => setMetadata(s => ({ ...s, contactName: e.target.value }))} />
              <input className="p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" type="email" placeholder="Email Address" value={metadata.email} onChange={e => setMetadata(s => ({ ...s, email: e.target.value }))} />
            </div>

            {/* Row 2: Demographics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <select className="p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white" value={metadata.industry} onChange={e => setMetadata(s => ({ ...s, industry: e.target.value }))}>
                <option value="">Select Industry...</option>
                {INDUSTRIES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
              </select>
              
              {metadata.industry === 'Other' && (
                <input className="p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-blue-50" placeholder="Please specify industry..." value={metadata.customIndustry} onChange={e => setMetadata(s => ({ ...s, customIndustry: e.target.value }))} autoFocus />
              )}
              
              <select className="p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white" value={metadata.companySize} onChange={e => setMetadata(s => ({ ...s, companySize: e.target.value }))}>
                <option value="">Select Company Size...</option>
                {COMPANY_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
              </select>
              
              <select className="p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white" value={metadata.role} onChange={e => setMetadata(s => ({ ...s, role: e.target.value }))}>
                <option value="">Select Your Role...</option>
                {ROLES.map(role => <option key={role} value={role}>{role}</option>)}
              </select>
            </div>

            {/* Row 3: Date */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
               <input className="p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-gray-50 text-gray-600" type="date" value={metadata.date} onChange={e => setMetadata(s => ({ ...s, date: e.target.value }))} />
            </div>
          </section>

          {DIMENSIONS.map(cat => (
            <div key={cat.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-8">
              <div className="bg-gray-50 border-b border-gray-200 p-6 flex justify-between items-center">
                 <div>
                   <h3 className="text-2xl font-bold text-gray-900">{cat.title}</h3>
                   <p className="text-gray-600 mt-1">{cat.description}</p>
                 </div>
                 <div className="text-right">
                    <div className="text-xl font-bold text-gray-800">
                      {scores.categories.find(c => c.id === cat.id)?.total} <span className="text-sm font-normal text-gray-500">pts</span>
                    </div>
                 </div>
              </div>
              
              <div className="p-6 space-y-8">
                {cat.items.map(q => (
                  <div key={q.id} className="pb-6 border-b border-gray-100 last:border-0 last:pb-0">
                    <h4 className="font-bold text-lg text-gray-800 mb-4">{q.title}</h4>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
                      {[1, 2, 3, 4, 5].map(v => {
                         const isSelected = answers[q.id] === v;
                         const levelInfo = MATURITY_LEVELS[v - 1];
                         return (
                           <div 
                             key={v} 
                             onClick={() => handleAnswer(q.id, v)} 
                             className={`cursor-pointer rounded-lg p-4 border-2 transition-all flex flex-col ${
                               isSelected ? 'bg-blue-50 border-blue-500 shadow-md transform scale-[1.02]' : 'bg-white border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                             }`}
                           >
                             <div className="flex items-center justify-between mb-2">
                               <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>{v}</span>
                               <span className="text-xs font-bold text-gray-500">{levelInfo.name}</span>
                             </div>
                             <p className="text-sm text-gray-700 leading-relaxed flex-grow">{q[`desc${v}`]}</p>
                           </div>
                         );
                      })}
                    </div>
                    
                    {q.messgroessen && (
                      <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700 flex gap-3 items-start">
                        <div className="mt-0.5 text-slate-400">📊</div>
                        <div>
                          <span className="font-semibold text-slate-800">Messgrößen (KPIs):</span> {q.messgroessen}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="flex gap-4 justify-center bg-white p-6 rounded-lg shadow-sm">
            <button onClick={exportToCSV} className="px-6 py-3 rounded-lg border hover:bg-gray-50 transition-colors font-medium">📊 Export CSV</button>
            <button onClick={() => setView('dashboard')} className="px-6 py-3 rounded-lg text-white font-medium hover:opacity-90 bg-[#ff7a00]">📈 View Dashboard</button>
            {isAdminAuthenticated && <button onClick={() => setView('admin')} className="px-6 py-3 rounded-lg border border-purple-300 text-purple-700 hover:bg-purple-50 transition-colors font-medium">🔧 Admin Analytics</button>}
            <button onClick={submit} className="px-6 py-3 rounded-lg text-white font-medium hover:opacity-90 bg-[#0b6b9a]">🚀 Submit & Generate Report</button>
          </div>
        </div>
      )}

      {/* Dashboard View */}
      {view === 'dashboard' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <h2 className="text-2xl font-bold mb-6 text-gray-900">AI Maturity Dashboard</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-gray-50 p-6 rounded-lg">
                <h4 className="text-lg font-semibold mb-4 text-gray-800">Maturity Radar Chart</h4>
                <div className="h-80"><Radar data={getRadarData(scores)} options={radarOptions} /></div>
              </div>
              <div className="bg-gray-50 p-6 rounded-lg">
                <h4 className="text-lg font-semibold mb-4 text-gray-800">Category Averages (1-5)</h4>
                <div className="h-80"><Bar data={getBarData(scores)} options={barOptions} /></div>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <h3 className="text-xl font-semibold mb-4 text-gray-900">Detailed Dimension Score Analysis</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {scores.categories.map(cat => {
                const level = Math.max(0, Math.min(4, Math.round(cat.score) - 1));
                const maturityInfo = MATURITY_LEVELS[level];
                return (
                  <div key={cat.id} className="p-4 border rounded-lg bg-gray-50">
                    <h4 className="font-semibold text-gray-800">{cat.title}</h4>
                    <div className="mt-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-gray-600">Points: {cat.total} | Avg:</span>
                        <span className="font-bold" style={{ color: maturityInfo.color }}>{cat.score.toFixed(1)}/5.0</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="h-2 rounded-full transition-all" style={{ width: `${(cat.score / 5) * 100}%`, backgroundColor: maturityInfo.color }}></div>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{maturityInfo.name}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-4 justify-center bg-white p-6 rounded-lg shadow-sm">
            <button onClick={() => setView('form')} className="px-6 py-3 rounded-lg border hover:bg-gray-50 transition-colors font-medium">← Back</button>
            <button onClick={exportToCSV} className="px-6 py-3 rounded-lg border hover:bg-gray-50 transition-colors font-medium">📊 Export Data</button>
          </div>
        </div>
      )}

      {/* Result View */}
      {view === 'result' && submitted && (
        <div className="bg-white p-8 rounded-lg shadow-sm">
          <h3 className="text-2xl font-bold mb-6 text-gray-900">Assessment Complete! 🎉</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="p-6 bg-gray-50 rounded-lg border-l-4" style={{ borderColor: maturity.color }}>
              <h4 className="font-semibold text-gray-800 mb-2">Overall Results</h4>
              <div className="text-4xl font-bold mb-1" style={{ color: maturity.color }}>{scores.percentage}%</div>
              <div className="text-lg font-medium text-gray-700 mb-2">{maturity.name} Level</div>
              <div className="text-sm font-semibold text-gray-600">Score: {scores.total} / {scores.max} points</div>
              <div className="text-sm text-gray-500 mt-2 italic">{maturity.description}</div>
            </div>
            <div className="p-6 bg-gray-50 rounded-lg">
              <h4 className="font-semibold text-gray-800 mb-2">Assessment Details</h4>
              <div className="space-y-2 text-sm">
                <div><strong>Organisation:</strong> {metadata.organisation || 'Not specified'}</div>
                <div><strong>Contact:</strong> {metadata.contactName || 'Not specified'}</div>
                <div><strong>Industry:</strong> {metadata.industry === 'Other' ? metadata.customIndustry : metadata.industry || 'Not specified'}</div>
                <div><strong>Date:</strong> {metadata.date}</div>
                <div><strong>ID:</strong> {submitted.id}</div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-6">
            <h4 className="font-semibold text-blue-800 mb-2">Shareable Report Link</h4>
            <div className="flex items-center gap-2">
              <input type="text" value={submitted.shareLink} readOnly className="flex-1 p-2 border border-blue-300 rounded bg-white text-sm" />
              <button onClick={() => navigator.clipboard.writeText(submitted.shareLink)} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">Copy</button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="p-4 bg-gray-50 border rounded-lg">
              <h4 className="font-semibold text-gray-800 mb-2">📁 Data Storage</h4>
              <div className="space-y-2">
                {submissionStatus.github === 'pending' && (
                  <div className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div><span className="text-sm text-blue-600">Processing...</span></div>
                )}
                {submissionStatus.github === 'success' && submissionStatus.githubDetails && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2"><div className="w-4 h-4 bg-green-500 rounded-full"></div><span className="text-sm text-green-600 font-medium">{submissionStatus.githubDetails.storage === 'github' ? 'GitHub Repository' : 'Local Storage'}</span></div>
                    <div className="text-xs text-gray-600 ml-6">{submissionStatus.githubDetails.message}</div>
                  </div>
                )}
                {submissionStatus.github === 'failed' && (
                  <div className="flex items-center gap-2"><div className="w-4 h-4 bg-red-500 rounded-full"></div><span className="text-sm text-red-600 font-medium">Storage Failed</span></div>
                )}
              </div>
            </div>
            <div className="p-4 bg-gray-50 border rounded-lg">
              <h4 className="font-semibold text-gray-800 mb-2">📧 Email Report</h4>
              <div className="flex items-center gap-2">
                {submissionStatus.email === 'pending' && <><div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div><span className="text-sm text-blue-600">Sending...</span></>}
                {submissionStatus.email === 'success' && <><div className="w-4 h-4 bg-green-500 rounded-full"></div><span className="text-sm text-green-600">Sent successfully</span></>}
                {submissionStatus.email === 'failed' && <><div className="w-4 h-4 bg-red-500 rounded-full"></div><span className="text-sm text-red-600">Sending failed</span></>}
              </div>
            </div>
          </div>
          
          <div className="flex gap-4 justify-center">
            <button onClick={exportToCSV} className="px-6 py-3 rounded-lg border hover:bg-gray-50 transition-colors font-medium">📊 Download CSV</button>
            <button onClick={() => setView('dashboard')} className="px-6 py-3 rounded-lg text-white font-medium bg-[#ff7a00] hover:opacity-90">📈 View Dashboard</button>
            <button onClick={() => setView('form')} className="px-6 py-3 rounded-lg text-white font-medium bg-[#0b6b9a] hover:opacity-90">🔄 New Assessment</button>
          </div>
        </div>
      )}
      
      {/* Report View (Loaded via URL parameter) */}
      {view === 'report' && reportData && (
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-lg shadow-sm">
            <div className="text-center mb-6">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">AI Maturity Assessment Report</h2>
              <p className="text-gray-600">Generated on {new Date(reportData.timestamp).toLocaleDateString()}</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold text-gray-800">Organisation</h3>
                <p className="text-lg">{reportData.metadata.organisation || 'Anonymous'}</p>
                <p className="text-sm text-gray-500 mt-1">{reportData.metadata.industry === 'Other' ? reportData.metadata.customIndustry : reportData.metadata.industry || ''}</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold text-gray-800">Overall Score</h3>
                <p className="text-3xl font-bold" style={{ color: reportData.maturity.color }}>
                  {reportData.scores.percentage ? `${reportData.scores.percentage}%` : `${reportData.scores.overall}/5.0`}
                </p>
                {reportData.scores.total && (
                  <p className="text-sm text-gray-500 mt-1">{reportData.scores.total} / {reportData.scores.max} pts</p>
                )}
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold text-gray-800">Maturity Level</h3>
                <p className="text-lg font-semibold" style={{ color: reportData.maturity.color }}>{reportData.maturity.name}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm">
            <h3 className="text-2xl font-bold mb-6 text-gray-900">Assessment Visualization</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-gray-50 p-6 rounded-lg">
                <h4 className="text-lg font-semibold mb-4 text-gray-800">Maturity Radar Chart</h4>
                <div className="h-80"><Radar data={getRadarData(reportData.scores)} options={radarOptions} /></div>
              </div>
              <div className="bg-gray-50 p-6 rounded-lg">
                <h4 className="text-lg font-semibold mb-4 text-gray-800">Category Scores</h4>
                <div className="h-80"><Bar data={getBarData(reportData.scores)} options={barOptions} /></div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm">
            <h3 className="text-xl font-semibold mb-4 text-gray-900">Detailed Category Analysis</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reportData.scores.categories.map(cat => {
                const level = Math.max(0, Math.min(4, Math.round(cat.score) - 1));
                const maturityInfo = MATURITY_LEVELS[level];
                return (
                  <div key={cat.id} className="p-4 border rounded-lg bg-gray-50">
                    <h4 className="font-semibold text-gray-800">{cat.title}</h4>
                    <div className="mt-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-gray-600">{cat.total ? `Points: ${cat.total} | ` : ''}Score</span>
                        <span className="font-bold" style={{ color: maturityInfo.color }}>{cat.score.toFixed(1)}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="h-2 rounded-full transition-all" style={{ width: `${(cat.score / 5) * 100}%`, backgroundColor: maturityInfo.color }}></div>
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
              onClick={() => {
                const csvContent = generateCSVContent(reportData);
                const blob = new Blob([csvContent], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url;
                a.download = `eraneos-report-${reportData.metadata.organisation || 'anonymous'}-${reportData.metadata.date}.csv`;
                a.click(); URL.revokeObjectURL(url);
              }}
              className="px-6 py-3 rounded-lg border hover:bg-gray-50 font-medium"
            >
              📊 Download CSV
            </button>
            <button 
              onClick={() => { window.history.replaceState({}, '', window.location.pathname); setView('form'); setReportData(null); }}
              className="px-6 py-3 rounded-lg text-white font-medium bg-[#0b6b9a] hover:opacity-90"
            >
              🔄 Take New Assessment
            </button>
          </div>
        </div>
      )}

      {/* Admin View */}
      {view === 'admin' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Assessment Analytics Dashboard</h2>
              <div className="flex gap-2">
                <button onClick={loadAllAssessments} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                  {loading ? '🔄 Loading...' : '🔄 Refresh Data'}
                </button>
                <button onClick={() => setView('form')} className="px-4 py-2 border rounded hover:bg-gray-50">← Back</button>
              </div>
            </div>

            {analytics && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h3 className="font-semibold text-blue-800">Total Assessments</h3>
                  <p className="text-2xl font-bold text-blue-900">{analytics.totalAssessments}</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <h3 className="font-semibold text-green-800">Average Score</h3>
                  <p className="text-2xl font-bold text-green-900">{analytics.averageScore}/5.0</p>
                </div>
                <div className="p-4 bg-orange-50 rounded-lg">
                  <h3 className="font-semibold text-orange-800">Recent (30 days)</h3>
                  <p className="text-2xl font-bold text-orange-900">{analytics.recentAssessments}</p>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg">
                  <h3 className="font-semibold text-purple-800">GitHub Integration</h3>
                  <p className="text-sm font-bold text-purple-900">{githubService.isAvailable() ? '✅ Active' : '❌ Not Configured'}</p>
                </div>
              </div>
            )}

            {analytics && (
              <div className="bg-gray-50 p-6 rounded-lg">
                <h3 className="text-lg font-semibold mb-4 text-gray-800">Maturity Level Distribution</h3>
                <div className="h-64">
                  <Bar 
                    data={{
                      labels: Object.keys(analytics.maturityDistribution),
                      datasets:[{
                        label: 'Assessments',
                        data: Object.values(analytics.maturityDistribution),
                        backgroundColor: MATURITY_LEVELS.map(l => l.color + '80'),
                        borderColor: MATURITY_LEVELS.map(l => l.color),
                        borderWidth: 2, borderRadius: 4,
                      }]
                    }}
                    options={{ responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }, plugins: { legend: { display: false } } }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">Filter & Export</h3>
            
            {/* Extended Admin Filters */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <input type="text" placeholder="Organisation" value={filters.organisation} onChange={e => setFilters(p => ({ ...p, organisation: e.target.value }))} className="p-2 border rounded" />
              <input type="text" placeholder="Contact Name" value={filters.contactName} onChange={e => setFilters(p => ({ ...p, contactName: e.target.value }))} className="p-2 border rounded" />
              <select value={filters.industry} onChange={e => setFilters(p => ({ ...p, industry: e.target.value }))} className="p-2 border rounded bg-white">
                <option value="">All Industries</option>
                {INDUSTRIES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
              </select>
              <select value={filters.companySize} onChange={e => setFilters(p => ({ ...p, companySize: e.target.value }))} className="p-2 border rounded bg-white">
                <option value="">All Company Sizes</option>
                {COMPANY_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
              </select>
              <select value={filters.role} onChange={e => setFilters(p => ({ ...p, role: e.target.value }))} className="p-2 border rounded bg-white">
                <option value="">All Roles</option>
                {ROLES.map(role => <option key={role} value={role}>{role}</option>)}
              </select>
              <select value={filters.maturityLevel} onChange={e => setFilters(p => ({ ...p, maturityLevel: e.target.value }))} className="p-2 border rounded bg-white">
                <option value="">All Levels</option>
                {MATURITY_LEVELS.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
              </select>
              <input type="date" placeholder="From Date" value={filters.dateFrom} onChange={e => setFilters(p => ({ ...p, dateFrom: e.target.value }))} className="p-2 border rounded" />
              <input type="date" placeholder="To Date" value={filters.dateTo} onChange={e => setFilters(p => ({ ...p, dateTo: e.target.value }))} className="p-2 border rounded" />
            </div>
            
            <div className="flex justify-between items-center bg-gray-50 p-4 rounded-lg mt-4">
              <div className="flex gap-2">
                <button onClick={() => setSelectedAssessments(selectedAssessments.length === filteredAssessments.length ?[] : filteredAssessments.map(a => a.id))} className="px-4 py-2 border rounded hover:bg-gray-100 text-sm bg-white">
                  {selectedAssessments.length === filteredAssessments.length ? 'Deselect All' : 'Select All'}
                </button>
                <button onClick={() => handleBulkExport('csv')} disabled={selectedAssessments.length === 0 || loading} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm">
                  📊 Export CSV ({selectedAssessments.length})
                </button>
                <button onClick={() => handleBulkExport('json')} disabled={selectedAssessments.length === 0 || loading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm">
                  📄 Export JSON ({selectedAssessments.length})
                </button>
                <button onClick={() => setFilters({ dateFrom: '', dateTo: '', organisation: '', contactName: '', industry: '', companySize: '', role: '', maturityLevel: '', scoreMin: '', scoreMax: '' })} className="px-4 py-2 text-gray-500 hover:text-gray-800 text-sm ml-4">
                  Clear Filters
                </button>
              </div>
              <span className="text-sm text-gray-600 font-medium">Showing {filteredAssessments.length} of {allAssessments.length}</span>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="p-4 text-left w-12"><input type="checkbox" checked={selectedAssessments.length === filteredAssessments.length && filteredAssessments.length > 0} onChange={() => setSelectedAssessments(selectedAssessments.length === filteredAssessments.length ?[] : filteredAssessments.map(a => a.id))} /></th>
                    <th className="p-4 text-left font-semibold text-gray-800">Organisation</th>
                    <th className="p-4 text-left font-semibold text-gray-800">Contact</th>
                    <th className="p-4 text-left font-semibold text-gray-800">Industry</th>
                    <th className="p-4 text-left font-semibold text-gray-800">Date</th>
                    <th className="p-4 text-left font-semibold text-gray-800">Pct.</th>
                    <th className="p-4 text-left font-semibold text-gray-800">Maturity</th>
                    <th className="p-4 text-left font-semibold text-gray-800 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssessments.map((assessment, i) => {
                    const mColor = MATURITY_LEVELS.find(l => l.name === assessment.maturityLevel)?.color || '#6b7280';
                    const industryDisplay = assessment.industry === 'Other' ? `Other (${assessment.customIndustry})` : assessment.industry;
                    
                    return (
                      <tr key={assessment.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="p-4"><input type="checkbox" checked={selectedAssessments.includes(assessment.id)} onChange={() => setSelectedAssessments(p => p.includes(assessment.id) ? p.filter(id => id !== assessment.id) : [...p, assessment.id])} /></td>
                        <td className="p-4 font-medium text-gray-900">{assessment.organisation}</td>
                        <td className="p-4 text-gray-600">{assessment.contactName || assessment.contact || 'N/A'}</td>
                        <td className="p-4 text-gray-600">{industryDisplay || 'N/A'}</td>
                        <td className="p-4 text-gray-600">{new Date(assessment.date).toLocaleDateString()}</td>
                        <td className="p-4 font-bold" style={{ color: mColor }}>{assessment.percentageScore ? `${assessment.percentageScore}%` : `${assessment.overallScore.toFixed(1)}`}</td>
                        <td className="p-4"><span className="px-2 py-1 rounded text-xs font-bold text-white shadow-sm" style={{ backgroundColor: mColor }}>{assessment.maturityLevel}</span></td>
                        <td className="p-4 text-right">
                          <div className="flex gap-2 justify-end">
                            <button onClick={async () => { const r = await githubService.getAssessment(assessment.filePath); if (r.success) { setReportData(r.data); setView('report'); } }} className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">View</button>
                            <button onClick={() => handleDeleteAssessment(assessment)} className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors">Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredAssessments.length === 0 && !loading && (
              <div className="p-8 text-center text-gray-500">{allAssessments.length === 0 ? 'No assessments found. Click "Refresh Data" to load from GitHub.' : 'No assessments match your current filter criteria.'}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
