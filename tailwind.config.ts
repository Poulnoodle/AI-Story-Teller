import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // 复古报纸配色
        newspaper: {
          bg: "#f4ecd8",
          ink: "#3e2a1f",
          gold: "#b08d2e",
          rule: "#8a6f4d",
        },
      },
      fontFamily: {
        serif: [
          "Georgia",
          '"Times New Roman"',
          '"Noto Serif SC"',
          '"Songti SC"',
          "SimSun",
          "serif",
        ],
      },
    },
  },
  plugins: [],
};
export default config;
