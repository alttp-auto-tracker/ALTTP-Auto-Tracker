/* ============================================================
   dungeon.js
   "Dungeon Progress" tile grid — one tile per dungeon showing
   how many of its locations have been checked, with an editable
   total (in case a seed's layout/settings change the check count).
   ============================================================ */

let lastDungeonStats=null;

function renderDungeonStat(key, found){

    const el = document.getElementById("dstat-" + key);
    const total = DUNGEON_TOTALS[key];
   
   
       // Ask the logic engine what this dungeon is worth.
    // TrackerState.save is the live inventory source. The modular tracker no
    // longer mirrors that state onto a separate window-level variable.
    const result = evaluateDungeon(key, TrackerState.save || {}, found);

    const renderedResult = {

        key,

        ...result

    };

    // The full dungeon row grid is optional now that counters live on
    // the map. Evaluation still runs so Best Play and Next Up work.
    if(!el) return renderedResult;
	
   // Update the progress bar
   const percent = total
    ? (found / total) * 100
    : 0;
	
	const fill = document.getElementById("dfill-" + key);

fill.style.width = percent + "%";

// Reset colors
fill.classList.remove(
    "progress-red",
    "progress-yellow",
    "progress-green",
    "progress-gray"
);

switch(result.state){

    case "red":
        fill.classList.add("progress-red");
        break;

    case "yellow":
        fill.classList.add("progress-yellow");
        break;

    case "green":
        fill.classList.add("progress-green");
        break;

    default:
        fill.classList.add("progress-gray");
}




// Update the chest count
document.getElementById("dbadge-" + key).textContent =
    `${found} / ${total}`;





// Update the rating
const ratingEl = document.getElementById("drating-" + key);

ratingEl.textContent = scoreToStars(result.score || 0);
ratingEl.className = "dungeon-rating " + result.state;
// Update the reason and keep the time estimate visible without
// requiring a hover or click.
const reasonParts = [result.reason];

if(result.timeEstimate?.label){

    reasonParts.push("⏱ " + result.timeEstimate.label);

}

document.getElementById("dreason-" + key).textContent =
    reasonParts.filter(Boolean).join(" • ");


// Switch layout depending on Practice/Race mode
if(isRaceMode()){

    el.classList.add("race-mode");

}else{

    el.classList.remove("race-mode");

}

// Remove any old color classes
el.classList.remove(
    "red",
    "yellow",
    "green",
    "gray"
);

el.classList.add(result.state);

return renderedResult;

}



function updateDungeonStats(stats){

    lastDungeonStats = stats;

    const rankings = [];

    DUNGEON_STAT_LABELS.forEach(([key,label])=>{

        const result = renderDungeonStat(

            key,

            stats[key] || 0

        );

        rankings.push({

            name: label,

            ...result

        });

    });

    rankings.sort(

        (a,b)=>b.score-a.score
		
		

    );
	
	TrackerState.rankings = rankings;
	
	updateRecommendation();

    if(typeof updateDungeonMapStats === "function"){
        updateDungeonMapStats(stats);
    }


  
}

// Builds the dungeon-stat tiles. Called once from main.js on load.
function initDungeonStats(){

  const dungeonStatsEl = document.getElementById('dungeonStats');

  if(!dungeonStatsEl) return;

  DUNGEON_STAT_LABELS.forEach(([key,label,abbr])=>{

    const el = document.createElement('div');

    el.className = "dungeon-row";
    el.id = 'dstat-' + key;

    const total = DUNGEON_TOTALS[key];

   el.innerHTML = `

    <div class="dungeon-code">
        ${abbr}
    </div>

<div class="dungeon-progress">

    <div class="progress-bar">
        <div class="progress-fill" id="dfill-${key}"></div>
    </div>

    <span class="dungeon-count" id="dbadge-${key}">
        0 / ${total}
    </span>

</div>

<div class="dungeon-rating" id="drating-${key}">
    ★★★★★
</div>

<div class="dungeon-reason" id="dreason-${key}">
    Many checks remain
</div>



`;

    dungeonStatsEl.appendChild(el);
	


  });

}


function renderNextPlays(best){

    const container = document.getElementById("nextPlays");
    if(!container) return;

    container.innerHTML = "";

    const playable = getRankedPlayableDungeons()
        .filter(dungeon => !best || dungeon.key !== best.key);

    // Prefer other immediately playable dungeons. If fewer than two are
    // open, fill the remaining slots with the closest locked options so the
    // command center stays useful without bringing back the full list.
    const locked = TrackerState.rankings
        .filter(dungeon =>
            !dungeon.complete &&
            dungeon.accessible <= 0 &&
            (!best || dungeon.key !== best.key)
        )
        .sort((a,b) =>
            (a.missing?.length || Infinity) -
            (b.missing?.length || Infinity)
        );

    const candidates = [...playable,...locked].slice(0,2);

    if(!candidates.length) return;

    const heading = document.createElement("div");
    heading.className = "next-plays-heading";
    heading.textContent = "NEXT UP";
    container.appendChild(heading);

    const grid = document.createElement("div");
    grid.className = "next-plays-grid";

    candidates.forEach((dungeon,index) => {

        const row = document.createElement("div");
        row.className = "next-play-row";

        const rank = document.createElement("span");
        rank.className = "next-play-rank";
        rank.textContent = String(index + 2);

        const summary = document.createElement("div");
        summary.className = "next-play-summary";

        const name = document.createElement("div");
        name.className = "next-play-name";
        name.textContent = getDungeonName(dungeon.key);

        const meta = document.createElement("div");
        meta.className = "next-play-meta";

        if(dungeon.accessible > 0){
            const checks = dungeon.accessible +
                " accessible check" +
                (dungeon.accessible === 1 ? "" : "s");

            meta.textContent = dungeon.timeEstimate?.label
                ? checks + " • " + dungeon.timeEstimate.label
                : checks;
        }else{
            meta.textContent = dungeon.reason || "Blocked";
            row.classList.add("blocked");
        }

        summary.appendChild(name);
        summary.appendChild(meta);

        const stars = document.createElement("span");
        stars.className = "next-play-stars";
        stars.textContent = scoreToStars(dungeon.score || 0);

        row.appendChild(rank);
        row.appendChild(summary);
        row.appendChild(stars);

        grid.appendChild(row);

    });

    container.appendChild(grid);

}



function updateBestPlay(result){

    document.getElementById("bestDungeon").textContent =
        result.dungeon;

    document.getElementById("bestStars").textContent =
        scoreToStars(result.score);

    const reasonEl =
        document.getElementById("bestReason");

    reasonEl.innerHTML = "";

    result.details.forEach(detail=>{

        const div = document.createElement("div");

        div.textContent = "✓ " + detail;

        reasonEl.appendChild(div);

    });

}


function updateRecommendation(){

    // Best Play / Next Up are Practice-only and require the user opt-in.
    // Race Legal and disabled coaching skip the live coaching UI entirely.
    if(typeof isBestPlayAllowed === "function" && !isBestPlayAllowed()){
        const nextPlays = document.getElementById("nextPlays");
        if(nextPlays) nextPlays.innerHTML = "";
        return;
    }

    const best = getBestDungeon();
    const isCurrentDungeon = !!best &&
        best.key === TrackerState.currentDungeon;

    renderNextPlays(best);

    const timeEl = document.getElementById("bestTime");
    const chipsEl = document.getElementById("bestChips");
    const factsEl = document.getElementById("bestFacts");

    if(!best){

        const dungeonEl = document.getElementById("bestDungeon");
        if(dungeonEl) dungeonEl.textContent = "—";
        const starsEl = document.getElementById("bestStars");
        if(starsEl) starsEl.textContent = "";
        const scoreEl = document.getElementById("bestScore");
        if(scoreEl) scoreEl.textContent = "";
        const reasonEl = document.getElementById("bestReason");
        if(reasonEl) reasonEl.textContent = "Waiting for game...";

        if(timeEl){
            timeEl.textContent = "";
        }

        if(chipsEl){
            chipsEl.innerHTML = "";
        }

        if(factsEl){
            factsEl.innerHTML = "";
        }

        if(typeof pushCoachingToServer === "function"){
            try{ pushCoachingToServer(typeof collectCoachingPayload === "function" ? collectCoachingPayload() : null); }catch(e){}
        }
        return;
    }

    document.getElementById("bestDungeon").textContent =
        getDungeonName(best.key);

    document.getElementById("bestStars").textContent =
        scoreToStars(best.score || 0);

    document.getElementById("bestScore").textContent =
        isCurrentDungeon
            ? (best.complete
                ? "DUNGEON COMPLETE"
                : best.accessible > 0
                    ? "CONTINUE HERE"
                    : "BLOCKED INSIDE")
            : best.title;

    document.getElementById("bestReason").textContent =
        isCurrentDungeon
            ? (best.complete
                ? "All tracked checks are finished — exit when ready"
                : best.accessible > 0
                    ? "You are here — keep playing this dungeon"
                    : "You are here, but no tracked checks are available")
            : best.reason;

    if(timeEl){

        timeEl.textContent = best.timeEstimate?.label
            ? "⏱ " + best.timeEstimate.label
            : "";

    }

    if(chipsEl){

        chipsEl.innerHTML = "";

        const availableCount = Math.max(
            0,
            Number(best.accessible) || 0
        );

        const blockedCount =
            best.blockedLocations?.length || 0;

        const chipData = [];

        if(isCurrentDungeon){
            chipData.push({
                text:"You are here",
                className:"context"
            });
        }

        if(availableCount){
            chipData.push({
                text:availableCount + " accessible checks",
                className:"available"
            });
        }

        if(blockedCount){
            chipData.push({
                text:blockedCount + " blocked",
                className:"blocked"
            });
        }

        (best.why || [])
            .filter(reason =>
                !/accessible checks/i.test(reason)
            )
            .forEach(reason => {
                chipData.push({
                    text:reason,
                    className:"context"
                });
            });

        chipData.forEach(chip => {

            const span = document.createElement("span");

            span.className =
                "best-chip " + chip.className;

            span.textContent = chip.text;

            chipsEl.appendChild(span);

        });

    }

    if(!factsEl) return;

    factsEl.innerHTML = "";

    const availableLocations =
        best.availableLocations || [];

    const availableCount = Math.max(
        0,
        Number(best.accessible) || 0
    );

    const blockedLocations =
        best.blockedLocations || [];

    if(!availableCount && !blockedLocations.length){
        return;
    }

    const grid = document.createElement("div");
    grid.className = "recommend-grid";

    if(availableCount){

        const availableSection =
            document.createElement("div");

        availableSection.className =
            "recommend-section available";

        const heading = document.createElement("div");
        heading.className = "recommend-heading";
        heading.textContent =
            "AVAILABLE NOW (" +
            availableCount +
            ")";

        availableSection.appendChild(heading);

        if(
            best.availableLocationsExact &&
            availableLocations.length === availableCount
        ){

            availableLocations.forEach(location => {

                const row = document.createElement("div");
                row.className = "recommend-item";
                row.textContent = "✓ " + location;

                availableSection.appendChild(row);

            });

        }else{

            const row = document.createElement("div");
            row.className = "recommend-item";
            row.textContent =
                "✓ " + availableCount +
                " unchecked location" +
                (availableCount === 1 ? "" : "s") +
                " available";

            availableSection.appendChild(row);

        }

        grid.appendChild(availableSection);

    }

    if(blockedLocations.length){

        const blockedSection =
            document.createElement("div");

        blockedSection.className =
            "recommend-section blocked";

        const heading = document.createElement("div");
        heading.className = "recommend-heading";
        heading.textContent =
            "BLOCKED (" + blockedLocations.length + ")";

        blockedSection.appendChild(heading);

        blockedLocations.forEach(location => {

            const row = document.createElement("div");
            row.className = "recommend-item blocked";

            const name = document.createElement("span");
            name.textContent = "• " + location.name;

            const need = document.createElement("span");
            need.className = "recommend-need";
            need.textContent =
                "Need: " + location.requires.join(", ");

            row.appendChild(name);
            row.appendChild(need);

            blockedSection.appendChild(row);

        });

        grid.appendChild(blockedSection);

    }

    factsEl.appendChild(grid);

    if(typeof pushCoachingToServer === "function"){
        try{
            pushCoachingToServer(
                typeof collectCoachingPayload === "function"
                    ? collectCoachingPayload()
                    : null
            );
        }catch(e){}
    }
}

function getDungeonName(key){

    const names = {

        hyruleCastle: "Hyrule Castle",
        easternPalace: "Eastern Palace",
        desertPalace: "Desert Palace",
        towerOfHera: "Tower of Hera",
        agahnimsTower: "Agahnim's Tower",
        palaceOfDarkness: "Palace of Darkness",
        swampPalace: "Swamp Palace",
        skullWoods: "Skull Woods",
        thievesTown: "Thieves' Town",
        icePalace: "Ice Palace",
        miseryMire: "Misery Mire",
        turtleRock: "Turtle Rock",
        ganonsTower: "Ganon's Tower"

    };

    return names[key] || key;

}
