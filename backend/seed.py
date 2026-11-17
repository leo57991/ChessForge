from pathlib import Path
from models import Base,engine
from main import import_pgn
Base.metadata.create_all(engine)
for path in (Path(__file__).resolve().parent.parent/'data').glob('*.pgn'):
 print(path.name,import_pgn(path.read_text(encoding='utf-8-sig')))
