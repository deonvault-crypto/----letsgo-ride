from typing import Optional

from pydantic import BaseModel, Field


class RoutingPoint(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class GeocodeRequestBody(BaseModel):
    address: str = Field(min_length=3, max_length=240)


class PlaceAutocompleteBody(BaseModel):
    query: str = Field(min_length=2, max_length=160)


class RouteRequestBody(BaseModel):
    origin: RoutingPoint
    destination: RoutingPoint
    include_polyline: bool = True


class ResolveRouteRequestBody(BaseModel):
    origin_address: str = Field(min_length=3, max_length=240)
    destination_address: str = Field(min_length=3, max_length=240)
    origin: Optional[RoutingPoint] = None
    destination: Optional[RoutingPoint] = None
    include_polyline: bool = True
