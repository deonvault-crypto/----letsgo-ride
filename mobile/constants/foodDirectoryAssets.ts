import { ImageSourcePropType } from "react-native";

type OfficialDirectoryLogo = {
  image: ImageSourcePropType;
  officialPage: string;
  officialAsset: string;
};

export const officialDirectoryLogos: Readonly<Record<string, OfficialDirectoryLogo>> = {
  "directory-kfc-zimbabwe": {
    image: require("../assets/images/kfc-zimbabwe-logo-official.png"),
    officialPage: "https://www.kfc.co.zw/",
    officialAsset: "https://cdn.tictuk.com/feb97cdd-a398-f792-4af6-90ac45d768da/assets/logoDesktopHeader.svg",
  },
  "directory-chicken-inn-zimbabwe": {
    image: require("../assets/images/chicken-inn-zimbabwe-logo-official.png"),
    officialPage: "https://www.simbisabrands.com/our-brands/chicken-inn/",
    officialAsset: "https://www.simbisabrands.com/assets/img/1882/ci-updated-logos-95x122-1.png",
  },
  "directory-pizza-inn-zimbabwe": {
    image: require("../assets/images/pizza-inn-zimbabwe-logo-official.png"),
    officialPage: "https://www.simbisabrands.com/our-brands/pizza-inn/",
    officialAsset: "https://www.simbisabrands.com/assets/img/1293/pi-updated-logos-95x122-2.png",
  },
  "directory-bakers-inn-zimbabwe": {
    image: require("../assets/images/bakers-inn-zimbabwe-logo-official.jpg"),
    officialPage: "https://www.simbisabrands.com/our-brands/bakers-inn/",
    officialAsset: "https://www.simbisabrands.com/assets/img/1287/bakers_inn_logo-1x.jpg",
  },
};
