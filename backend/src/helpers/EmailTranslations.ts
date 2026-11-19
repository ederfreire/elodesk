const emailTranslations: Record<string, Record<string, string>> = {
  pt: {
    // Signup verification
    signupTitle: "Verificação de Cadastro",
    signupSubject: "Código de Verificação - Cadastro",
    signupGreeting: "Olá",
    signupMessage: "Seu código de verificação para concluir o cadastro é:",
    signupExpiry: "Este código expira em <strong>10 minutos</strong>.",
    signupIgnore: "Se você não solicitou este cadastro, ignore este e-mail.",

    // Password reset
    resetTitle: "Recuperação de Senha",
    resetSubject: "Código de Recuperação de Senha",
    resetMessage: "Seu código de verificação é:",
    resetExpiry: "Este código expira em <strong>10 minutos</strong>.",
    resetIgnore: "Se você não solicitou esta recuperação, ignore este e-mail.",

    // SMTP test
    smtpTestSubject: "Teste SMTP",
    smtpTestTitle: "Teste de configuração SMTP",
    smtpTestMessage: "Se você recebeu este e-mail, suas configurações estão corretas!",

    // Welcome email
    welcomeSubject: "Bem vindo ao {systemName} - Dados de Acesso",
    welcomeGreeting: "Olá {name}. Seja bem vindo(a) ao {systemName}!",
    welcomeInstruction: "Para acessar sua conta, clique no botão abaixo:",
    welcomeButton: "Acessar minha conta",
    welcomeAccessTitle: "📋 Seus dados de acesso:",
    welcomeCompany: "Empresa:",
    welcomeEmail: "E-mail:",
    welcomePassword: "Senha:",
    welcomeExpiry: "Vencimento:",
    welcomeLinkExpiry: "<strong>Este link expira em 1 hora.</strong> Caso não consiga usá-lo, acesse o link abaixo com a senha que você criou no momento do cadastro:",
    welcomeFooter: "Este e-mail foi enviado automaticamente pelo {systemName}. Não responda.",
  },
  en: {
    signupTitle: "Signup Verification",
    signupSubject: "Verification Code - Signup",
    signupGreeting: "Hello",
    signupMessage: "Your verification code to complete the signup is:",
    signupExpiry: "This code expires in <strong>10 minutes</strong>.",
    signupIgnore: "If you did not request this signup, please ignore this email.",

    resetTitle: "Password Recovery",
    resetSubject: "Password Recovery Code",
    resetMessage: "Your verification code is:",
    resetExpiry: "This code expires in <strong>10 minutes</strong>.",
    resetIgnore: "If you did not request this recovery, please ignore this email.",

    smtpTestSubject: "SMTP Test",
    smtpTestTitle: "SMTP Configuration Test",
    smtpTestMessage: "If you received this email, your settings are correct!",

    welcomeSubject: "Welcome to {systemName} - Access Details",
    welcomeGreeting: "Hello {name}. Welcome to {systemName}!",
    welcomeInstruction: "To access your account, click the button below:",
    welcomeButton: "Access my account",
    welcomeAccessTitle: "📋 Your access details:",
    welcomeCompany: "Company:",
    welcomeEmail: "Email:",
    welcomePassword: "Password:",
    welcomeExpiry: "Expiration:",
    welcomeLinkExpiry: "<strong>This link expires in 1 hour.</strong> If you can't use it, access the link below with the password you created during signup:",
    welcomeFooter: "This email was sent automatically by {systemName}. Do not reply.",
  },
  es: {
    signupTitle: "Verificación de Registro",
    signupSubject: "Código de Verificación - Registro",
    signupGreeting: "Hola",
    signupMessage: "Tu código de verificación para completar el registro es:",
    signupExpiry: "Este código expira en <strong>10 minutos</strong>.",
    signupIgnore: "Si no solicitaste este registro, ignora este correo.",

    resetTitle: "Recuperación de Contraseña",
    resetSubject: "Código de Recuperación de Contraseña",
    resetMessage: "Tu código de verificación es:",
    resetExpiry: "Este código expira en <strong>10 minutos</strong>.",
    resetIgnore: "Si no solicitaste esta recuperación, ignora este correo.",

    smtpTestSubject: "Prueba SMTP",
    smtpTestTitle: "Prueba de configuración SMTP",
    smtpTestMessage: "Si recibiste este correo, ¡tu configuración es correcta!",

    welcomeSubject: "Bienvenido a {systemName} - Datos de Acceso",
    welcomeGreeting: "Hola {name}. ¡Bienvenido(a) a {systemName}!",
    welcomeInstruction: "Para acceder a tu cuenta, haz clic en el botón de abajo:",
    welcomeButton: "Acceder a mi cuenta",
    welcomeAccessTitle: "📋 Tus datos de acceso:",
    welcomeCompany: "Empresa:",
    welcomeEmail: "Correo:",
    welcomePassword: "Contraseña:",
    welcomeExpiry: "Vencimiento:",
    welcomeLinkExpiry: "<strong>Este enlace expira en 1 hora.</strong> Si no puedes usarlo, accede al enlace a continuación con la contraseña que creaste al registrarte:",
    welcomeFooter: "Este correo fue enviado automáticamente por {systemName}. No respondas.",
  },
  ar: {
    signupTitle: "التحقق من التسجيل",
    signupSubject: "رمز التحقق - التسجيل",
    signupGreeting: "مرحباً",
    signupMessage: "رمز التحقق الخاص بك لإكمال التسجيل هو:",
    signupExpiry: "ينتهي هذا الرمز خلال <strong>10 دقائق</strong>.",
    signupIgnore: "إذا لم تطلب هذا التسجيل، يرجى تجاهل هذا البريد.",

    resetTitle: "استعادة كلمة المرور",
    resetSubject: "رمز استعادة كلمة المرور",
    resetMessage: "رمز التحقق الخاص بك هو:",
    resetExpiry: "ينتهي هذا الرمز خلال <strong>10 دقائق</strong>.",
    resetIgnore: "إذا لم تطلب هذه الاستعادة، يرجى تجاهل هذا البريد.",

    smtpTestSubject: "اختبار SMTP",
    smtpTestTitle: "اختبار إعدادات SMTP",
    smtpTestMessage: "إذا تلقيت هذا البريد، فإعداداتك صحيحة!",

    welcomeSubject: "مرحباً بك في {systemName} - بيانات الوصول",
    welcomeGreeting: "مرحباً {name}. أهلاً بك في {systemName}!",
    welcomeInstruction: "للوصول إلى حسابك، انقر على الزر أدناه:",
    welcomeButton: "الوصول إلى حسابي",
    welcomeAccessTitle: "📋 بيانات الوصول الخاصة بك:",
    welcomeCompany: "الشركة:",
    welcomeEmail: "البريد الإلكتروني:",
    welcomePassword: "كلمة المرور:",
    welcomeExpiry: "تاريخ الانتهاء:",
    welcomeLinkExpiry: "<strong>تنتهي صلاحية هذا الرابط خلال ساعة واحدة.</strong> إذا لم تتمكن من استخدامه، قم بالوصول إلى الرابط أدناه باستخدام كلمة المرور التي أنشأتها أثناء التسجيل:",
    welcomeFooter: "تم إرسال هذا البريد تلقائياً بواسطة {systemName}. لا ترد عليه.",
  },
};

export const getEmailTranslation = (lang: string, key: string, replacements?: Record<string, string>): string => {
  const normalizedLang = (lang || "pt").split("-")[0].toLowerCase();
  const translations = emailTranslations[normalizedLang] || emailTranslations["pt"];
  let text = translations[key] || emailTranslations["pt"][key] || key;

  if (replacements) {
    for (const [k, v] of Object.entries(replacements)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
  }

  return text;
};

export const getDirection = (lang: string): string => {
  const normalizedLang = (lang || "pt").split("-")[0].toLowerCase();
  return normalizedLang === "ar" ? "rtl" : "ltr";
};

export default emailTranslations;
