/* ============================================================
   navigator.js
   Routing / navigation helpers
   ============================================================ */

let playerRegion = "Central";

const DUNGEON_REGIONS = {

    hyruleCastle: "Central",

    easternPalace: "Eastern",

    desertPalace: "Desert",

    towerOfHera: "DeathMountain",

    agahnimsTower: "Central",

    palaceOfDarkness: "DarkEast",

    swampPalace: "Lake",

    skullWoods: "LostWoods",

    thievesTown: "Kakariko",

    icePalace: "Ice",

    miseryMire: "Mire",

    turtleRock: "DarkMountain",

    ganonsTower: "DarkMountain"

};


function updatePlayerRegion(area){

    playerRegion =
        AREA_TO_REGION[area] || "Central";

}

const ROUTE_PRIORITY = {

    Central:{

        hyruleCastle:20,
        easternPalace:12,
        desertPalace:8,
        towerOfHera:6

    },

    Kakariko:{

        thievesTown:25,
        skullWoods:22,
        hyruleCastle:10,
        towerOfHera:8

    },

    Eastern:{

        easternPalace:25,
        palaceOfDarkness:20,
        swampPalace:10

    },

    Desert:{

        desertPalace:25,
        easternPalace:10,
        hyruleCastle:8

    },

    DeathMountain:{

        towerOfHera:25,
        turtleRock:12,
        ganonsTower:10

    },

    DarkEast:{

        palaceOfDarkness:25,
        swampPalace:18,
        turtleRock:10

    },

    Lake:{

        swampPalace:25,
        icePalace:12

    },

    LostWoods:{

        skullWoods:25,
        thievesTown:18

    },

    Mire:{

        miseryMire:25,
        icePalace:15

    },

    Ice:{

        icePalace:25,
        miseryMire:12

    },

    DarkMountain:{

        turtleRock:25,
        ganonsTower:22,
        towerOfHera:12

    }

};



function getRegionBonus(key){

    return ROUTE_PRIORITY[playerRegion]?.[key] || 0;

}
