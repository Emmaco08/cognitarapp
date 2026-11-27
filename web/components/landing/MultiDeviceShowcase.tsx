"use client";

export default function MultiDeviceShowcase() {
  return (
    <section className="rs-container" data-rs-reveal>
      <div className="rs-devices-panel">
        <h2 className="rs-h2">Built for every classroom device.</h2>
        <p className="rs-section-sub">
          Host from one Windows lab PC while students connect from laptops, Chromebooks, iPads, and Android tablets over school Wi-Fi. No internet required during exams.
        </p>

        <div className="rs-device-pills">
          <span className="rs-device-pill">Native Windows Studio</span>
          <span className="rs-device-pill">Fully offline LAN</span>
          <span className="rs-device-pill">Encrypted cloud backups</span>
        </div>

        <div className="rs-devices-stage">
          {/* Center-back Laptop displaying real CogniTara Studio Desktop */}
          <div className="rs-hw-laptop">
            <div className="rs-hw-laptop-notch" aria-hidden="true" />
            <div className="rs-hw-laptop-screen">
              <img
                src="/tour/01-studio-server.webp?v=240"
                alt="CogniTara Studio running natively on a Windows laptop"
                width={1600}
                height={1000}
                loading="lazy"
              />
            </div>
          </div>

          {/* Front-left Phone displaying real Student Mobile Dashboard */}
          <div className="rs-hw-phone">
            <div className="rs-hw-phone-island" aria-hidden="true" />
            <div className="rs-hw-phone-screen">
              <img
                src="/tour/device-mobile-student.webp"
                alt="CogniTara Student Portal on a mobile phone"
                width={520}
                height={1092}
                loading="lazy"
              />
            </div>
          </div>

          {/* Front-right Tablet displaying real Student Live Exam Room with Calculator */}
          <div className="rs-hw-tablet">
            <div className="rs-hw-tablet-screen">
              <img
                src="/tour/08-live-exam-room.webp?v=240"
                alt="CogniTara Live Exam Room with Scientific Calculator on a classroom tablet"
                width={1600}
                height={1000}
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
