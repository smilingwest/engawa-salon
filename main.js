// ==========================================
// Navigation & Header
// ==========================================

const header = document.getElementById('header');
const navToggle = document.getElementById('nav-toggle');
const navMenu = document.getElementById('nav-menu');
const navLinks = document.querySelectorAll('.nav-link');

// Mobile menu toggle
if (navToggle) {
    navToggle.addEventListener('click', () => {
        navMenu.classList.toggle('active');
        const icon = navToggle.querySelector('i');
        icon.classList.toggle('fa-bars');
        icon.classList.toggle('fa-times');
    });
}

// Close mobile menu when clicking nav links
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        navMenu.classList.remove('active');
        const icon = navToggle.querySelector('i');
        icon.classList.remove('fa-times');
        icon.classList.add('fa-bars');
    });
});

// Header scroll effect
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        header.style.boxShadow = '0 4px 20px rgba(139, 111, 71, 0.15)';
    } else {
        header.style.boxShadow = '0 2px 10px rgba(139, 111, 71, 0.1)';
    }
});

// ==========================================
// Scroll to Top Button
// ==========================================

const scrollTopBtn = document.getElementById('scrollTop');

window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
        scrollTopBtn.classList.add('active');
    } else {
        scrollTopBtn.classList.remove('active');
    }
});

scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});

// ==========================================
// Contact Form Modal
// ==========================================

const openFormBtn = document.getElementById('openFormBtn');
const contactModal = document.getElementById('contactModal');
const closeModalBtn = document.getElementById('closeModal');
const contactForm = document.getElementById('contactForm');

// Open modal
openFormBtn.addEventListener('click', () => {
    contactModal.classList.add('active');
});

// Close modal
closeModalBtn.addEventListener('click', () => {
    contactModal.classList.remove('active');
});

// Close modal when clicking outside
contactModal.addEventListener('click', (e) => {
    if (e.target === contactModal) {
        contactModal.classList.remove('active');
    }
});

// Form submission
contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Disable submit button to prevent double submission
    const submitBtn = contactForm.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 送信中...';
    
    // Get form data
    const formData = new FormData(contactForm);
    
    // Get type label
    const typeLabels = {
        'workshop': 'ワークショップ開催',
        'consulting': '教育コンサルティング',
        'speaker': '講師派遣',
        'other': 'その他'
    };
    const type = formData.get('type');
    const typeLabel = typeLabels[type] || type;
    
    // Prepare data for Formspree
    const data = {
        name: formData.get('name'),
        organization: formData.get('organization') || '未記入',
        email: formData.get('email'),
        phone: formData.get('phone') || '未記入',
        type: typeLabel,
        message: formData.get('message'),
        _subject: `【えんがわ茶論】お問い合わせ - ${typeLabel}`
    };
    
    try {
        // Send to Formspree
        const response = await fetch('https://formspree.io/f/xeeqworz', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            // Success
            alert('お問い合わせを送信しました！\nご入力いただいたメールアドレス宛に確認メールが届きます。\n2営業日以内にご返信いたします。');
            
            // Reset form and close modal
            contactForm.reset();
            contactModal.classList.remove('active');
        } else {
            // Error
            throw new Error('送信に失敗しました');
        }
    } catch (error) {
        // Error handling
        alert('送信中にエラーが発生しました。\n恐れ入りますが、もう一度お試しいただくか、\n直接 smilingwest@e-saron.com までメールでご連絡ください。');
        console.error('Form submission error:', error);
    } finally {
        // Re-enable submit button
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
});

// ==========================================
// AI Chatbot
// ==========================================

const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSend');
const suggestionBtns = document.querySelectorAll('.suggestion-btn');

// Chat responses database
const chatResponses = {
    'ワークショップ': {
        keywords: ['ワークショップ', '内容', 'プログラム', 'どんな'],
        response: `えんがわ茶論のワークショップは、<strong>レゴ®シリアスプレイ®</strong>を活用した参加型プログラムです。

主なテーマ：
• チームビルディング - 対話を通じた信頼関係構築
• 行動変容 - 内省から具体的なアクションへ
• SDGs × 探究学習 - 社会課題を自分ごと化

独自メソッド：
手を動かして思考を可視化（レゴ）→ 言語化 → 生成AIで新たな視点獲得 → 行動目標へ

対象者：小学生から企業幹部まで、幅広く対応しています！`
    },
    '料金': {
        keywords: ['料金', '費用', '価格', 'いくら', '金額', '見積もり', 'コスト'],
        response: `料金は、プログラムの内容、参加人数、実施時間、開催形式によって異なります。

【目安】
• 2時間ワークショップ：2万円〜
• 1日研修プログラム：5万円〜
• 複数回シリーズ：要相談

【含まれるもの】
• プログラム設計・カスタマイズ
• ファシリテーション
• 教材・資料
• 事前打ち合わせ
• フォローアップ

オンライン開催の場合は、交通費不要でコストを抑えられます。
まずはお気軽に、ご予算とご要望をお聞かせください！`
    },
    '実績': {
        keywords: ['実績', '事例', '経験', '活動', 'どこで', '実施'],
        response: `えんがわ茶論は、<strong>2016年から10年間で50件以上</strong>の登壇・ファシリテーション実績があります。

【最新の実績（2025年）】
• 有名企業社会人教育部ワークショップ
• 福島南高校ワークショップ
• トコシエDesignイベント

【幅広い領域】
• 教育機関：高校、大学、教員研修
• 企業：チームビルディング、研修
• 自治体：地方創生、住民ワークショップ
• 国際：台湾の高校との国際授業

【活動エリア】
全国対応（東京、仙台、大阪、愛媛、群馬など）

対面・オンライン・ハイブリッドすべて可能です！`
    },
    '対象者': {
        keywords: ['対象', '誰', '参加者', '年齢', '小学生', '中学生', '高校生', '大学生', '企業', '自治体'],
        response: `えんがわ茶論は、<strong>幅広い対象者</strong>に対応しています！

【教育機関】
• 小学生 - 楽しみながら探究心を育む
• 中高生 - 探究学習、SDGs、キャリア教育
• 大学生 - チームビルディング、社会課題解決

【企業・組織】
• 若手社員 - 主体性・協働スキル育成
• 中堅リーダー - チームマネジメント
• 経営層 - ビジョン共有、組織改革

【自治体・地域】
• 職員研修
• 住民参加型ワークショップ
• 地方創生プロジェクト

年齢や立場を問わず、「学びの場」をデザインすることが私たちの強みです！`
    },
    '形式': {
        keywords: ['形式', 'オンライン', '対面', 'ハイブリッド', 'zoom', 'リモート', '場所'],
        response: `えんがわ茶論は、<strong>3つの開催形式</strong>すべてに対応しています！

【対面開催】
• 対話の温度感を大切に
• レゴを使った体験型
• チーム一体感を最大化
• 全国どこでも出張可能

【オンライン開催】
• Zoom、Google Meetなど対応
• 遠方でも気軽に参加
• 交通費不要でコスト削減
• チャット・ブレイクアウトルーム活用

【ハイブリッド開催】
• 対面とオンラインを融合
• 柔軟な参加スタイル
• 広域での同時開催

コロナ禍以降、オンラインファシリテーションの経験も豊富です。
状況やご要望に応じて、最適な形式をご提案します！`
    },
    '得意分野': {
        keywords: ['得意', '専門', '強み', '特徴', 'レゴ', 'SDGs', '探究', 'AI'],
        response: `えんがわ茶論の<strong>得意分野</strong>はこちらです！

【1. レゴ×生成AIの独自メソッド】
手を動かして思考を可視化 → AIで新たな視点獲得 → 行動目標化

【2. チームビルディング】
対話を通じた信頼関係構築と、組織の一体感醸成

【3. 行動変容プログラム】
内省から具体的アクションへ導く実践的設計

【4. SDGs × 探究学習】
社会課題を自分ごと化し、探究心を育む

【5. 教員としての現場感覚】
日々生徒と向き合う中で培った実践知と理論の融合

【6. 問いづくり（QFT）】
主体的な学びを促進する「問い」の質を高める

10年間の継続的な学びと進化が、私たちの強みです！`
    },
    '問い合わせ': {
        keywords: ['問い合わせ', '連絡', 'メール', '相談', '依頼', '申し込み'],
        response: `お問い合わせありがとうございます！

【2つの方法】

1️⃣ <strong>このチャットで直接相談</strong>
まずはお気軽に、ご質問やご要望をお聞かせください。

2️⃣ <strong>メールフォームで詳しく相談</strong>
「お問い合わせフォームを開く」ボタンから、詳細をお送りください。

【対応時間】
平日 9:00-18:00
通常2営業日以内にご返信します。

【お伝えいただけると助かること】
• ご希望の内容（ワークショップ、研修、講演など）
• 対象者・人数
• 希望日程・期間
• 開催形式（対面/オンライン/ハイブリッド）
• ご予算

縁側のような対話から、一緒に最適なプログラムを考えましょう！`
    },
    '教育': {
        keywords: ['教育', '学校', '教員', '先生', '授業', '探究'],
        response: `えんがわ茶論の代表は、<strong>私立中高の現役教員</strong>です！

【教育分野での専門性】
• 英語科教員（中学・高校）
• 探究学習（総合的な探究の時間）
• ICT・生成AI活用
• 問いづくり（QFT）
• 国際教育

【教育機関向けサービス】
• 探究学習の設計支援
• 教員研修（ICT活用、ファシリテーション）
• 生徒向けワークショップ
• カリキュラム開発支援
• 学校間連携・国際交流支援

現場教員だからこそわかる、実践的なサポートが強みです。
教育現場での課題やお悩み、お気軽にご相談ください！`
    },
    'あいさつ': {
        keywords: ['こんにちは', 'はじめまして', 'よろしく', 'hello'],
        response: `こんにちは！えんがわ茶論へようこそ。

縁側で語り合うような、温かく開かれた対話を大切にしています。

【よくあるご質問】
• ワークショップの内容
• 料金・見積もり
• 実績紹介
• 対象者
• 開催形式（対面/オンライン）
• 得意分野

どんなことでもお気軽にお尋ねください！
一緒に、あなたの組織やチームに最適なプログラムを考えましょう。`
    }
};

// Function to find best matching response
function getBotResponse(userMessage) {
    const message = userMessage.toLowerCase();
    
    // Find matching category
    for (const [category, data] of Object.entries(chatResponses)) {
        for (const keyword of data.keywords) {
            if (message.includes(keyword.toLowerCase())) {
                return data.response;
            }
        }
    }
    
    // Default response
    return `ご質問ありがとうございます！

以下のような内容についてお答えできます：

• <strong>ワークショップの内容</strong>について
• <strong>料金・見積もり</strong>について
• <strong>実績・事例</strong>の紹介
• <strong>対象者</strong>について
• <strong>開催形式</strong>（対面/オンライン/ハイブリッド）
• <strong>得意分野・強み</strong>について
• <strong>お問い合わせ方法</strong>について

もう少し具体的にお聞かせいただけますか？
または、「お問い合わせフォームを開く」ボタンから、直接ご相談いただくこともできます。`;
}

// Function to add message to chat
function addMessage(text, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${isUser ? 'user' : 'bot'}`;
    
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    avatarDiv.innerHTML = isUser ? '<i class="fas fa-user"></i>' : '<i class="fas fa-leaf"></i>';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = `<p>${text}</p>`;
    
    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Function to send message
function sendMessage() {
    const message = chatInput.value.trim();
    
    if (message === '') return;
    
    // Add user message
    addMessage(message, true);
    
    // Clear input
    chatInput.value = '';
    
    // Show typing indicator
    setTimeout(() => {
        const response = getBotResponse(message);
        addMessage(response, false);
    }, 800);
}

// Send button click
chatSendBtn.addEventListener('click', sendMessage);

// Enter key press
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Suggestion buttons
suggestionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const question = btn.dataset.question;
        chatInput.value = question;
        sendMessage();
    });
});

// ==========================================
// Smooth Scroll for Anchor Links
// ==========================================

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            const headerHeight = header.offsetHeight;
            const targetPosition = target.offsetTop - headerHeight;
            
            window.scrollTo({
                top: targetPosition,
                behavior: 'smooth'
            });
        }
    });
});

// ==========================================
// Animation on Scroll
// ==========================================

const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe elements for animation
document.addEventListener('DOMContentLoaded', () => {
    const animatedElements = document.querySelectorAll(`
        .service-card,
        .expertise-card,
        .strength-item,
        .solution-item,
        .timeline-item,
        .testimonial-card,
        .stat-card
    `);
    
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
});

// ==========================================
// Activity Markers Animation on Japan Map
// ==========================================

const activityMarkers = document.querySelectorAll('.activity-marker');

activityMarkers.forEach((marker, index) => {
    marker.addEventListener('mouseenter', function() {
        this.style.transform = 'scale(1.5)';
        this.style.transition = 'transform 0.3s ease';
    });
    
    marker.addEventListener('mouseleave', function() {
        this.style.transform = 'scale(1)';
    });
});

// ==========================================
// Console Log - Ready Message
// ==========================================

console.log('%c えんがわ茶論 ', 'background: #8B6F47; color: white; font-size: 20px; padding: 10px; border-radius: 5px;');
console.log('%c Webサイトが正常に読み込まれました！ ', 'color: #7C9D96; font-size: 14px;');
console.log('学びと対話で未来を創る - ENGAWA SALON');