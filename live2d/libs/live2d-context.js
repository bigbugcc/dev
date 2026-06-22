/**
 * Local time, season, and broad time-zone context for interaction text.
 */

(function() {
  "use strict";

  const Context = {
    getTimeOfDay(hour) {
      if (hour <= 4) return "lateNight";
      if (hour <= 7) return "dawn";
      if (hour <= 10) return "morning";
      if (hour <= 13) return "noon";
      if (hour <= 17) return "afternoon";
      if (hour <= 20) return "evening";
      return "night";
    },

    getRegion(timeZone) {
      const zone = String(timeZone || "");
      if (/^(Australia|Pacific)\//.test(zone)) return "oceania";
      if (/^Europe\//.test(zone)) return "europe";
      if (/^Africa\//.test(zone)) return "africa";
      if (/^America\/(Argentina|Sao_Paulo|Bahia|Belem|Bogota|Caracas|Cayenne|Fortaleza|Guayaquil|Guyana|La_Paz|Lima|Maceio|Manaus|Montevideo|Noronha|Paramaribo|Port_of_Spain|Recife|Rio_Branco|Santarem|Santiago|Asuncion|Mexico)/.test(zone)) return "latinAmerica";
      if (/^America\//.test(zone)) return "northAmerica";
      if (/^Asia\/(Shanghai|Hong_Kong|Macau|Taipei|Tokyo|Seoul|Pyongyang|Ulaanbaatar)/.test(zone)) return "eastAsia";
      if (/^Asia\/(Bangkok|Brunei|Ho_Chi_Minh|Jakarta|Jayapura|Kuala_Lumpur|Kuching|Macassar|Manila|Phnom_Penh|Pontianak|Rangoon|Saigon|Singapore|Vientiane|Yangon)/.test(zone)) return "southeastAsia";
      if (/^Asia\/(Calcutta|Colombo|Dacca|Dhaka|Karachi|Kathmandu|Katmandu|Kolkata|Kabul|Thimphu)/.test(zone)) return "southAsia";
      if (/^Asia\/(Aden|Amman|Baghdad|Bahrain|Beirut|Damascus|Dubai|Gaza|Hebron|Jerusalem|Kuwait|Muscat|Qatar|Riyadh|Tehran)/.test(zone)) return "westAsia";
      if (/^Asia\//.test(zone)) return "asia";
      return "global";
    },

    getHemisphere(timeZone) {
      const zone = String(timeZone || "");
      return /^(Australia|Antarctica)\//.test(zone) ||
        /^Pacific\/(Auckland|Chatham|Easter|Fiji|Galapagos|Guadalcanal|Noumea|Tahiti)/.test(zone) ||
        /^Africa\/(Blantyre|Gaborone|Harare|Johannesburg|Kigali|Kinshasa|Luanda|Lusaka|Maputo|Maseru|Mbabane|Windhoek|Antananarivo)/.test(zone) ||
        /^America\/(Argentina|Asuncion|Montevideo|Santiago|Sao_Paulo)/.test(zone)
        ? "south"
        : "north";
    },

    getSeason(month, hemisphere) {
      const northSeason = month <= 1 || month === 11 ? "winter" : month <= 4 ? "spring" : month <= 7 ? "summer" : "autumn";
      if (hemisphere !== "south") return northSeason;
      return { winter: "summer", spring: "autumn", summer: "winter", autumn: "spring" }[northSeason];
    },

    getState(date = new Date()) {
      let timeZone = "";
      try {
        timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      } catch (err) {
        console.warn("[Live2D] Unable to resolve the local time zone.", err);
      }

      const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      return {
        timeOfDay: this.getTimeOfDay(date.getHours()),
        weekday: weekdays[date.getDay()],
        season: this.getSeason(date.getMonth(), this.getHemisphere(timeZone)),
        region: this.getRegion(timeZone),
        specialDate: `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      };
    },

    getWeightedPaths(kind, getText, rand) {
      const state = this.getState();
      const paths = [];
      const add = (path, weight = 1) => {
        if (getText(path) === undefined) return;
        for (let i = 0; i < weight; i++) paths.push(path);
      };

      add(`context.specialDates.${state.specialDate}`, kind === "welcome" ? 5 : 2);
      add(`context.time.${state.timeOfDay}`, kind === "welcome" ? 3 : 1);
      add(`context.season.${state.season}`, kind === "welcome" ? 2 : 1);
      add(`context.weekday.${state.weekday}`);
      add(`context.regions.${state.region}`);

      const topics = getText("context.topics") || {};
      const names = Object.keys(topics);
      if (names.length > 0) add(`context.topics.${rand(names)}`);
      return paths;
    },
  };

  window.Live2DModules = window.Live2DModules || {};
  window.Live2DModules.Context = Context;
})();
