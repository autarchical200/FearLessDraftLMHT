import { Champion } from '../types';

let activeVersion = '15.4.1'; // Fallback version if request fails

export async function fetchChampions(): Promise<Champion[]> {
  try {
    // Fetch latest version list from Riot
    const versionResponse = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
    if (versionResponse.ok) {
      const versions = await versionResponse.json();
      if (Array.isArray(versions) && versions.length > 0) {
        activeVersion = versions[0];
        console.log('Dynamic patch version updated to LoL:', activeVersion);
      }
    }
  } catch (err) {
    console.warn('Could not fetch dynamic versions, utilizing fallback patch:', activeVersion, err);
  }

  try {
    const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/${activeVersion}/data/en_US/champion.json`);
    const data = await response.json();
    return Object.values(data.data) as Champion[];
  } catch (error) {
    console.error('Error fetching champions:', error);
    return [];
  }
}

export function getChampionImageUrl(championId: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${activeVersion}/img/champion/${championId}.png`;
}

export function getChampionLoadingUrl(championId: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${championId}_0.jpg`;
}

