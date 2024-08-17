/* tailwind.config.js */

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  theme: {
    extend: {
      colors: {
        "tommy-red": "#cb1017",
        "dark-blue": "#00174f",
        "light-blue": "#0000ee",
        purple: "#551a8b",
      },
      ringColor: {
        tommy: "#cb1017",
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};
