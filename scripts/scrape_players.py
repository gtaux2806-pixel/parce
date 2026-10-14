import os
import re
import time
import sys
import urllib.parse
import requests
from bs4 import BeautifulSoup

# Ensure UTF-8 output on Windows to avoid UnicodeEncodeError
if sys.platform.startswith("win"):
    sys.stdout.reconfigure(encoding='utf-8')

# Headers to avoid being blocked by Transfermarkt
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    "Referer": "https://www.transfermarkt.com/"
}

TEAMS_FILE = "lib/teams.ts"
OUTPUT_DIR = "public/players"
MAPPING_FILE = "lib/playerimages.ts"

def normalize_filename(name):
    # Remove accents, keep letters/numbers/spaces, replace spaces with underscores, lowercase
    import unicodedata
    normalized = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode('utf-8')
    normalized = re.sub(r'[^a-zA-Z0-9\s]', '', normalized)
    return normalized.lower().strip().replace(" ", "_")

def get_unique_players():
    players = set()
    if not os.path.exists(TEAMS_FILE):
        print(f"Error: No se encontró {TEAMS_FILE}")
        return []
    
    # Read the file and extract string items inside arrays
    with open(TEAMS_FILE, "r", encoding="utf-8") as f:
        content = f.read()
        
    # Match double quoted string values (which are the player names)
    # The team names are keys e.g. "Real Madrid": [
    # Let's parse all strings inside the [ ] brackets of the teams database
    db_match = re.search(r"export const teamsDatabase: Record<string, string\[\]> = (\{.*?\});", content, re.DOTALL)
    if db_match:
        db_content = db_match.group(1)
        # Find all strings in the list blocks
        # Look for player names inside lists
        for match in re.finditer(r'\[([^\]]+)\]', db_content):
            list_content = match.group(1)
            player_names = re.findall(r'"([^"]+)"', list_content)
            for p in player_names:
                players.add(p.strip())
    else:
        # Fallback regex search for any double quoted string that is likely a player
        player_names = re.findall(r'"([^"]+)"', content)
        for p in player_names:
            # Filter out keys (teams)
            if p not in ["Real Madrid", "Barcelona", "Atletico Madrid", "Manchester United", "Manchester City", "Liverpool", "Chelsea", "Arsenal", "Juventus", "Inter", "Milan", "Bayern Munich", "Borussia Dortmund", "PSG", "Ajax", "Porto", "Benfica", "Sporting CP", "Galatasaray", "Fenerbahce", "Boca Juniors", "River Plate", "Flamengo", "Palmeiras"]:
                players.add(p.strip())
                
    return sorted(list(players))

def scrape_player_photo(player_name):
    print(f"Buscando a: {player_name}...")
    
    # 1. Try English Wikipedia first (highly reliable, no bot blocks, good public domain/Creative Commons portraits)
    try:
        query = urllib.parse.quote(player_name)
        wiki_url = f"https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch={query}&gsrlimit=1&prop=pageimages&piprop=thumbnail&pithumbsize=300&format=json"
        wiki_headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
        response = requests.get(wiki_url, headers=wiki_headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            pages = data.get("query", {}).get("pages", {})
            if pages:
                # Get the first page's thumbnail
                first_page = next(iter(pages.values()))
                img_url = first_page.get("thumbnail", {}).get("source")
                if img_url:
                    print(f"  Encontrado en Wikipedia: {img_url}")
                    return img_url
    except Exception as e:
        print(f"  Error en Wikipedia para {player_name}: {e}")

    # 2. Fallback to Transfermarkt
    query = urllib.parse.quote(player_name)
    search_url = f"https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query={query}"
    
    try:
        response = requests.get(search_url, headers=HEADERS, timeout=10)
        if response.status_code != 200:
            print(f"  Error HTTP {response.status_code} para {player_name} en Transfermarkt")
            return None
        
        soup = BeautifulSoup(response.text, "html.parser")
        player_row = soup.select_one("div.box table.items tbody tr")
        if not player_row:
            player_row = soup.select_one("table.items tbody tr")
            
        if player_row:
            img_tag = player_row.select_one("td img")
            if img_tag and img_tag.get("src"):
                img_url = img_tag.get("src")
                if "small" in img_url:
                    img_url = img_url.replace("small", "header")
                
                if "placeholder" in img_url or "default" in img_url or "silhouette" in img_url:
                    print(f"  Imagen es un placeholder genérico.")
                    return None
                    
                print(f"  Encontrado en Transfermarkt: {img_url}")
                return img_url
        else:
            print(f"  No se encontraron resultados de búsqueda.")
    except Exception as e:
        print(f"  Error al buscar/parsear Transfermarkt: {e}")
        
    return None

def download_image(url, filename):
    try:
        response = requests.get(url, headers=HEADERS, timeout=15)
        if response.status_code == 200:
            filepath = os.path.join(OUTPUT_DIR, filename)
            with open(filepath, "wb") as f:
                f.write(response.content)
            return True
    except Exception as e:
        print(f"  Error al descargar imagen: {e}")
    return False

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    players = get_unique_players()
    print(f"Se encontraron {len(players)} jugadores únicos en la base de datos.")
    
    mapping = {}
    
    # Read existing mapping if exists to avoid re-downloading
    if os.path.exists(MAPPING_FILE):
        with open(MAPPING_FILE, "r", encoding="utf-8") as f:
            content = f.read()
            # Basic parsing of key-value pairs
            matches = re.findall(r'"([^"]+)":\s*"([^"]+)"', content)
            for k, v in matches:
                mapping[k] = v

    count = 0
    for p in players:
        # Check if already scraped
        filename = f"{normalize_filename(p)}.jpg"
        local_path = f"/players/{filename}"
        
        if os.path.exists(os.path.join(OUTPUT_DIR, filename)):
            mapping[p] = local_path
            continue
            
        img_url = scrape_player_photo(p)
        if img_url:
            print(f"  Encontrado: {img_url}")
            success = download_image(img_url, filename)
            if success:
                print(f"  ¡Descargado exitosamente!")
                mapping[p] = local_path
                count += 1
            else:
                print(f"  Fallo al descargar.")
        else:
            print(f"  No se pudo obtener foto.")
            
        # Rate limit friendly sleep
        time.sleep(0.5)
        
    # Write mapping file
    with open(MAPPING_FILE, "w", encoding="utf-8") as f:
        f.write("export const playerImages: Record<string, string> = {\n")
        for player, path in sorted(mapping.items()):
            f.write(f'  "{player}": "{path}",\n')
        f.write("};\n")
        
    print(f"Proceso finalizado. Se descargaron {count} nuevas imágenes.")
    print(f"Mapeo guardado en {MAPPING_FILE}")

if __name__ == "__main__":
    main()
