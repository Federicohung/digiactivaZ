import { useEffect } from "react";
import { ArrowLeft, MessageCircle, MapPin, Mail, Phone } from "lucide-react";

const WHATSAPP_URL = "https://wa.me/56951107102";

const LegalLayout = ({ title, description, children }) => {
  useEffect(() => {
    document.title = `${title} | DigiActiva`;
    const ensureMeta = (name, content) => {
      let tag = document.querySelector(`meta[name="${name}"]`);
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("name", name);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", content);
    };
    ensureMeta("description", description);
    ensureMeta("robots", "index, follow");
    // Canonical
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", `https://www.digiactiva.com${window.location.pathname}`);
  }, [title, description]);

  return (
    <div className="min-h-screen bg-white">
      {/* Simple header */}
      <header className="border-b border-slate-200/60 sticky top-0 bg-white/85 backdrop-blur-2xl z-40">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-lg font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>
            DIGIACTIVA
          </a>
          <a href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft size={14} /> Volver al inicio
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16 md:py-24">
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-[-0.03em] text-slate-900 mb-4 leading-[1.1]" style={{ fontFamily: "Outfit, sans-serif" }}>
          {title}
        </h1>
        <p className="text-slate-500 text-sm mb-10">Última actualización: enero 2026</p>
        <article className="prose prose-slate max-w-none text-slate-700 leading-relaxed space-y-5">
          {children}
        </article>
      </main>

      {/* Footer compacto */}
      <footer className="py-10" style={{ background: "#f5f5f7" }}>
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-slate-500 text-xs mb-3">
            DigiActiva desarrolla soluciones digitales, automatización con IA, WhatsApp y sistemas de gestión comercial para pymes, negocios locales y profesionales en Chile y España.
          </p>
          <div className="flex justify-center items-center gap-5 text-xs text-slate-500 flex-wrap">
            <a href="/privacidad" className="hover:text-slate-900 hover:underline">Privacidad</a>
            <a href="/cookies" className="hover:text-slate-900 hover:underline">Cookies</a>
            <a href="/terminos" className="hover:text-slate-900 hover:underline">Términos</a>
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-slate-900">
              <MessageCircle size={12} /> Contacto
            </a>
          </div>
          <p className="text-slate-400 text-[11px] mt-4">© 2025 DigiActiva. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
};

// H2/H3 styled
const H2 = ({ children }) => (
  <h2 className="text-2xl font-semibold text-slate-900 mt-10 mb-3 tracking-[-0.01em]" style={{ fontFamily: "Outfit, sans-serif" }}>{children}</h2>
);
const P = ({ children }) => <p className="mb-3">{children}</p>;
const UL = ({ children }) => <ul className="list-disc pl-6 space-y-2 mb-4">{children}</ul>;

export const PrivacyPage = () => (
  <LegalLayout
    title="Política de privacidad"
    description="Política de privacidad de DigiActiva. Cómo tratamos los datos personales de pymes, negocios locales y profesionales en Chile y España."
  >
    <P>En DigiActiva respetamos y protegemos la privacidad de los usuarios que interactúan con nuestro sitio web, chat IA, WhatsApp Business y sistema CRM. Esta política describe qué datos tratamos, con qué finalidad y cuáles son tus derechos conforme a la Ley 19.628 de Chile y al Reglamento (UE) 2016/679 (RGPD) aplicable en España.</P>

    <H2>1. Responsable del tratamiento</H2>
    <P><strong>DigiActiva</strong>, Merced 838-A, Oficina 117, Santiago de Chile. Contacto: <a className="text-blue-600 hover:underline" href="mailto:contacto@digiactiva.com">contacto@digiactiva.com</a>.</P>

    <H2>2. Datos que recogemos</H2>
    <UL>
      <li>Datos identificativos: nombre, email, teléfono, nombre de la empresa, nicho.</li>
      <li>Datos de interacción: mensajes enviados al chat IA o WhatsApp, páginas visitadas, sesión de navegación.</li>
      <li>Datos técnicos: dirección IP, tipo de navegador, dispositivo, cookies (ver política de cookies).</li>
    </UL>

    <H2>3. Finalidad del tratamiento</H2>
    <UL>
      <li>Responder consultas comerciales y técnicas.</li>
      <li>Gestionar oportunidades de venta en nuestro CRM interno.</li>
      <li>Enviar información sobre planes, servicios y novedades (solo si hay consentimiento previo).</li>
      <li>Mejorar el servicio y medir la calidad de atención.</li>
    </UL>

    <H2>4. Base legal</H2>
    <P>El tratamiento se basa en: (a) tu consentimiento al interactuar con el chat, completar formularios o escribir por WhatsApp; (b) el interés legítimo en gestionar relaciones comerciales; (c) el cumplimiento de obligaciones contractuales.</P>

    <H2>5. Conservación</H2>
    <P>Conservamos los datos mientras exista una relación comercial activa y hasta 5 años después, o hasta que el titular ejerza su derecho de supresión.</P>

    <H2>6. Cesiones a terceros</H2>
    <P>Usamos proveedores de confianza para operar el servicio: OpenAI (procesamiento IA), Meta (WhatsApp Business Cloud), ElevenLabs (voz IA), MongoDB Atlas (base de datos). No vendemos tus datos. Estos proveedores actúan como encargados del tratamiento y cuentan con garantías adecuadas de transferencia internacional.</P>

    <H2>7. Tus derechos</H2>
    <P>Puedes ejercer en cualquier momento tus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a <a className="text-blue-600 hover:underline" href="mailto:contacto@digiactiva.com">contacto@digiactiva.com</a>. En España, tienes derecho a reclamar ante la Agencia Española de Protección de Datos (www.aepd.es). En Chile, ante la Agencia de Protección de Datos cuando esté operativa.</P>

    <H2>8. Seguridad</H2>
    <P>Aplicamos medidas técnicas y organizativas razonables: cifrado HTTPS, autenticación JWT, hash de contraseñas con bcrypt, aislamiento multi-tenant en el CRM, y copias de seguridad.</P>
  </LegalLayout>
);

export const CookiesPage = () => (
  <LegalLayout
    title="Política de cookies"
    description="Política de cookies de DigiActiva. Tipos de cookies que usamos y cómo gestionarlas."
  >
    <P>Este sitio utiliza cookies y tecnologías similares (como localStorage) para funcionar correctamente, recordar preferencias y medir el uso del servicio.</P>

    <H2>1. ¿Qué es una cookie?</H2>
    <P>Una cookie es un pequeño archivo que se almacena en tu navegador cuando visitas un sitio web. Permite al sitio recordar información entre visitas.</P>

    <H2>2. Tipos de cookies que usamos</H2>
    <UL>
      <li><strong>Técnicas (necesarias)</strong>: permiten la navegación básica y funcionalidades esenciales como mantener tu sesión de chat activa.</li>
      <li><strong>Funcionales</strong>: guardan preferencias como el idioma o el país seleccionado (Chile/España) en la página de planes.</li>
      <li><strong>Analíticas</strong>: si activas el consentimiento, usamos herramientas como Google Analytics 4 para medir tráfico y conversión agregada (no identifica personas).</li>
      <li><strong>Publicidad</strong>: si activas el consentimiento, usamos Google Ads y Meta Pixel para medir la efectividad de nuestras campañas.</li>
    </UL>

    <H2>3. Cómo gestionar las cookies</H2>
    <P>Puedes aceptar, rechazar o eliminar cookies desde la configuración de tu navegador. Si rechazas cookies técnicas, algunas funcionalidades pueden no estar disponibles.</P>

    <H2>4. Duración</H2>
    <P>Las cookies técnicas duran lo que dure la sesión o hasta que las borres manualmente. Las cookies analíticas tienen una caducidad máxima de 13 meses.</P>

    <H2>5. Contacto</H2>
    <P>Para cualquier consulta sobre cookies: <a className="text-blue-600 hover:underline" href="mailto:contacto@digiactiva.com">contacto@digiactiva.com</a>.</P>
  </LegalLayout>
);

export const TermsPage = () => (
  <LegalLayout
    title="Términos y condiciones"
    description="Términos y condiciones del servicio DigiActiva para pymes, negocios locales y profesionales en Chile y España."
  >
    <P>Estos términos regulan el uso del sitio web <strong>www.digiactiva.com</strong> y de los servicios contratados a DigiActiva. Al utilizar nuestros servicios aceptas estos términos.</P>

    <H2>1. Descripción del servicio</H2>
    <P>DigiActiva ofrece una plataforma SaaS de agentes IA, WhatsApp Business y CRM inteligente para pymes, negocios locales y profesionales en Chile y España. Los planes disponibles (Esencial, Premium, Élite, Escala) se detallan en la sección <a className="text-blue-600 hover:underline" href="/#planes">Planes</a>.</P>

    <H2>2. Contratación y facturación</H2>
    <UL>
      <li>Los planes se contratan por mes calendario, sin permanencia obligatoria.</li>
      <li>La facturación se emite mensualmente en CLP (Chile) o EUR (España).</li>
      <li>El cliente puede cancelar en cualquier momento; el servicio permanece activo hasta el final del ciclo pagado.</li>
      <li>Los precios publicados no incluyen IVA salvo indicación expresa.</li>
    </UL>

    <H2>3. Responsabilidad del cliente</H2>
    <UL>
      <li>Proporcionar información correcta y mantener actualizadas las credenciales de integración (WhatsApp Business Cloud, ElevenLabs, etc.).</li>
      <li>Usar el servicio conforme a la legislación aplicable y a las políticas de cada plataforma conectada (en especial la Política de Mensajería Comercial de Meta).</li>
      <li>Mantener la confidencialidad de sus credenciales de acceso al CRM.</li>
    </UL>

    <H2>4. Limitación de responsabilidad</H2>
    <P>DigiActiva presta el servicio con diligencia razonable pero no garantiza resultados comerciales específicos. No somos responsables de caídas de servicios de terceros (OpenAI, Meta, ElevenLabs) ni del uso indebido por parte del cliente. No prometemos ventas garantizadas ni resultados asegurados.</P>

    <H2>5. Propiedad intelectual</H2>
    <P>El software, el diseño y el contenido del sitio son propiedad de DigiActiva. El cliente conserva la propiedad de sus datos, conversaciones y configuraciones.</P>

    <H2>6. Modificaciones</H2>
    <P>DigiActiva puede modificar estos términos con aviso previo de 30 días al email registrado. El uso continuado tras la modificación implica aceptación.</P>

    <H2>7. Ley aplicable</H2>
    <P>Para clientes en Chile: legislación chilena, tribunales de Santiago. Para clientes en España: legislación española, tribunales de Madrid.</P>

    <H2>8. Contacto</H2>
    <P>Cualquier duda sobre estos términos: <a className="text-blue-600 hover:underline" href="mailto:contacto@digiactiva.com">contacto@digiactiva.com</a>.</P>
  </LegalLayout>
);
