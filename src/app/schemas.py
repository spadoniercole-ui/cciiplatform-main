from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import License, SpaceType, Space
# Supponiamo tu abbia una funzione get_admin() per la sicurezza
# from auth import get_admin 

router = APIRouter(prefix="/admin/setup", tags=["Wizard Config"])

@router.post("/step1-license")
def create_license(data: LicenseSchema, db: Session = Depends(get_db)):
    # Logica: controlla se la licenza esiste già
    if db.query(License).filter(License.name == data.name).first():
        raise HTTPException(status_code=400, detail="Licenza già esistente")
    
    new_license = License(**data.dict())
    db.add(new_license)
    db.commit()
    db.refresh(new_license)
    return {"id": new_license.id, "status": "created"}

@router.post("/step2-space-type")
def create_space_type(data: SpaceTypeSchema, db: Session = Depends(get_db)):
    new_type = SpaceType(**data.dict())
    db.add(new_type)
    db.commit()
    return {"id": new_type.id, "status": "created"}

@router.post("/step3-space")
def create_space(data: SpaceSchema, db: Session = Depends(get_db)):
    # Validazione incrociata: verifica che la licenza e il tipo esistano
    if not db.query(License).filter(License.id == data.license_id).first():
        raise HTTPException(status_code=404, detail="Licenza non trovata")
    
    if not db.query(SpaceType).filter(SpaceType.id == data.space_type_id).first():
        raise HTTPException(status_code=404, detail="Tipo spazio non trovato")
        
    new_space = Space(**data.dict())
    db.add(new_space)
    db.commit()
    return {"id": new_space.id, "status": "success", "message": "Sistema inizializzato"}
